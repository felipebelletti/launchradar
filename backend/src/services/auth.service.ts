import { randomBytes } from 'crypto';
import { verifyMessage, getAddress } from 'viem';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import argon2 from 'argon2';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';
import { geolocateIp, detectAnomaly } from './location.service.js';
import type { FastifyRequest } from 'fastify';
import type { User, Session, FlagSeverity } from '@prisma/client';

const log = createChildLogger('auth');

// ─── Wallet detection ───────────────────────────────────────

function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function isSolanaAddress(address: string): boolean {
  // Solana addresses are base58-encoded ed25519 public keys (32 bytes → 32-44 chars)
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/** Normalize address for DB storage. EVM → lowercase, Solana → as-is (base58 is case-sensitive). */
function normalizeAddress(address: string): string {
  if (isEvmAddress(address)) return address.toLowerCase();
  return address;
}

// ─── Wallet Auth ────────────────────────────────────────────

export async function generateNonce(walletAddress: string): Promise<string> {
  const addr = normalizeAddress(walletAddress);
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const message = `Sign in to LaunchRadar\n\nThis signature verifies you own this wallet. It does not trigger a transaction or cost any gas.\n\nWallet: ${addr}\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}\nExpires: ${expiresAt.toISOString()}`;

  await prisma.walletNonce.upsert({
    where: { walletAddress: addr },
    update: { nonce: message, expiresAt },
    create: { walletAddress: addr, nonce: message, expiresAt },
  });

  return message;
}

export async function verifyWalletSignature(
  walletAddress: string,
  signature: string
): Promise<User> {
  const addr = normalizeAddress(walletAddress);

  const record = await prisma.walletNonce.findUnique({
    where: { walletAddress: addr },
  });

  if (!record) throw new Error('No nonce found for this wallet');
  if (record.expiresAt < new Date()) {
    await prisma.walletNonce.delete({ where: { walletAddress: addr } });
    throw new Error('Nonce expired');
  }

  // Verify signature based on wallet type
  let valid = false;

  if (isEvmAddress(walletAddress)) {
    // EVM: recover signer from personal_sign
    valid = await verifyMessage({
      address: getAddress(walletAddress) as `0x${string}`,
      message: record.nonce,
      signature: signature as `0x${string}`,
    });
  } else if (isSolanaAddress(walletAddress)) {
    // Solana: verify ed25519 signature
    try {
      const pubkey = bs58.decode(walletAddress);
      const messageBytes = new TextEncoder().encode(record.nonce);
      // Signature comes as base58 from Phantom, or as a JSON array of bytes
      let sigBytes: Uint8Array;
      if (signature.startsWith('[')) {
        // JSON byte array (some wallets return this)
        sigBytes = new Uint8Array(JSON.parse(signature) as number[]);
      } else {
        // base58 encoded
        sigBytes = bs58.decode(signature);
      }
      valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkey);
    } catch (err) {
      log.warn('Solana signature verification error', { err });
      valid = false;
    }
  } else {
    throw new Error('Unsupported wallet address format');
  }

  if (!valid) throw new Error('Invalid signature');

  // Delete used nonce
  await prisma.walletNonce.delete({ where: { walletAddress: addr } });

  // Find or create user
  let user = await prisma.user.findUnique({ where: { walletAddress: addr } });
  if (!user) {
    user = await prisma.user.create({
      data: { walletAddress: addr },
    });
    log.info('New user created via wallet', { userId: user.id, wallet: addr });
  }

  return user;
}

// ─── Email Auth ─────────────────────────────────────────────

export async function registerWithEmail(
  email: string,
  password: string
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
    },
  });

  log.info('New user created via email', { userId: user.id });
  return user;
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) throw new Error('Invalid credentials');

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new Error('Invalid credentials');

  return user;
}

// ─── Session Management ────────────────────────────────────

function extractFingerprint(request: FastifyRequest): string {
  const ip = request.ip;
  const ua = request.headers['user-agent'] ?? '';
  const tz = (request.headers['x-timezone'] as string) ?? '';
  // Simple hash of ip+ua+tz
  const data = `${ip}|${ua}|${tz}`;
  // Use a simple hash — no crypto needed, just dedup
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export async function createSession(
  userId: string,
  request: FastifyRequest
): Promise<Session> {
  const maxAgeDays = config.SESSION_MAX_AGE_DAYS;
  const expiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000);
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] ?? 'unknown';
  const fingerprint = extractFingerprint(request);

  // Geolocate the IP
  const geo = await geolocateIp(ip);

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
      ipAddress: ip,
      userAgent,
      country: geo?.country ?? null,
      city: geo?.city ?? null,
      latitude: geo?.lat ?? null,
      longitude: geo?.lon ?? null,
      fingerprint,
    },
  });

  // Update user lastActiveAt
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() },
  }).catch(() => {});

  // Check location anomaly in background
  checkLocationAnomaly(userId, session).catch((err) => {
    log.warn('Location anomaly check failed', { err, userId });
  });

  log.info('Session created', {
    sessionId: session.id,
    userId,
    country: geo?.country,
    city: geo?.city,
  });

  return session;
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) return null;
  if (!session.isActive) return null;
  if (session.expiresAt < new Date()) {
    // Expired — deactivate
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    }).catch(() => {});
    return null;
  }

  return session.user;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { isActive: false },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
}

export async function getUserSessions(userId: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { userId, isActive: true },
    orderBy: { lastSeenAt: 'desc' },
  });
}

// ─── Location Anomaly ──────────────────────────────────────

async function checkLocationAnomaly(userId: string, newSession: Session): Promise<void> {
  const severity = await detectAnomaly(userId, {
    ip: newSession.ipAddress,
    country: newSession.country,
    city: newSession.city,
    lat: newSession.latitude,
    lon: newSession.longitude,
    fingerprint: newSession.fingerprint,
  });

  if (!severity) return;

  // Find the conflicting existing session
  const existingSessions = await prisma.session.findMany({
    where: {
      userId,
      isActive: true,
      id: { not: newSession.id },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: 1,
  });

  const existingSession = existingSessions[0];
  if (!existingSession) return;

  // Create location flag
  const reasonMap: Record<string, string> = {
    LOW: `New login from ${newSession.city ?? 'unknown city'}, ${newSession.country ?? '?'} — different city, same country`,
    MEDIUM: `New login from ${newSession.country ?? 'unknown country'} — different country, sessions > 1h apart`,
    HIGH: `Simultaneous sessions from ${existingSession.country ?? '?'} and ${newSession.country ?? '?'} — possible account sharing`,
  };

  await prisma.locationFlag.create({
    data: {
      userId,
      severity: severity as FlagSeverity,
      reason: reasonMap[severity] ?? 'Unknown anomaly',
      session1Id: existingSession.id,
      session2Id: newSession.id,
      ipAddress: newSession.ipAddress,
      country: newSession.country,
      city: newSession.city,
    },
  });

  log.warn('Location anomaly detected', { userId, severity });

  // HIGH severity: force re-auth on the new session
  if (severity === 'HIGH') {
    await prisma.session.update({
      where: { id: newSession.id },
      data: { isActive: false },
    });
    log.warn('HIGH severity — new session deactivated', {
      userId,
      sessionId: newSession.id,
    });
  }
}

// ─── Twitter OAuth helpers ─────────────────────────────────

export async function findOrCreateTwitterUser(
  twitterId: string,
  twitterHandle: string,
  twitterAvatar: string | null
): Promise<User> {
  let user = await prisma.user.findUnique({ where: { twitterId } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        twitterId,
        twitterHandle,
        twitterAvatar,
        displayName: twitterHandle,
        avatarUrl: twitterAvatar,
      },
    });
    log.info('New user created via Twitter', { userId: user.id, handle: twitterHandle });
  } else {
    // Update profile info on each login
    user = await prisma.user.update({
      where: { id: user.id },
      data: { twitterHandle, twitterAvatar, avatarUrl: twitterAvatar ?? user.avatarUrl },
    });
  }

  return user;
}
