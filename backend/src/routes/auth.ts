import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  generateNonce,
  verifyWalletSignature,
  sendMagicLink,
  verifyMagicToken,
  createSession,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  findOrCreateTwitterUser,
  getSessionUser,
} from '../services/auth.service.js';

const log = createChildLogger('auth-routes');

const SESSION_MAX_AGE = config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60; // seconds

function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie('lr_session', sessionId, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Wallet Auth ────────────────────────────────────────

  app.post(
    '/auth/wallet/nonce',
    async (
      request: FastifyRequest<{ Body: { walletAddress: string } }>,
      reply: FastifyReply
    ) => {
      const { walletAddress } = request.body ?? {};
      if (!walletAddress) {
        return reply.status(400).send({ error: 'walletAddress is required' });
      }

      const nonce = await generateNonce(walletAddress);
      return reply.send({ nonce });
    }
  );

  app.post(
    '/auth/wallet/verify',
    async (
      request: FastifyRequest<{ Body: { walletAddress: string; signature: string } }>,
      reply: FastifyReply
    ) => {
      const { walletAddress, signature } = request.body ?? {};
      if (!walletAddress || !signature) {
        return reply.status(400).send({ error: 'walletAddress and signature are required' });
      }

      try {
        const user = await verifyWalletSignature(walletAddress, signature);
        const session = await createSession(user.id, request);
        setSessionCookie(reply, session.id);
        return reply.send({
          user: sanitizeUser(user),
        });
      } catch (err) {
        log.warn('Wallet verify failed', { err });
        return reply.status(401).send({ error: (err as Error).message });
      }
    }
  );

  // ─── X OAuth ────────────────────────────────────────────

  app.get('/auth/twitter', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!config.TWITTER_CLIENT_ID) {
      return reply.status(503).send({ error: 'Twitter OAuth not configured' });
    }

    // Generate PKCE code verifier + challenge
    const codeVerifier = randomBytes(32).toString('base64url');
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = Buffer.from(digest).toString('base64url');

    const state = randomBytes(16).toString('hex');

    // Store code_verifier and state in a signed cookie
    reply.setCookie('lr_oauth_state', JSON.stringify({ state, codeVerifier }), {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.TWITTER_CLIENT_ID,
      redirect_uri: config.TWITTER_CALLBACK_URL,
      scope: 'tweet.read users.read offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(`https://twitter.com/i/oauth2/authorize?${params.toString()}`);
  });

  app.get(
    '/auth/twitter/callback',
    async (
      request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
      reply: FastifyReply
    ) => {
      const { code, state, error } = request.query;

      if (error || !code || !state) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=twitter_denied`);
      }

      // Retrieve stored state + code_verifier
      const oauthCookie = request.cookies?.['lr_oauth_state'];
      if (!oauthCookie) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=missing_state`);
      }

      let storedState: string;
      let codeVerifier: string;
      try {
        const parsed = JSON.parse(oauthCookie) as { state: string; codeVerifier: string };
        storedState = parsed.state;
        codeVerifier = parsed.codeVerifier;
      } catch {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=invalid_state`);
      }

      if (state !== storedState) {
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=state_mismatch`);
      }

      // Clear oauth cookie
      reply.clearCookie('lr_oauth_state', { path: '/' });

      try {
        // Exchange code for access token
        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${config.TWITTER_CLIENT_ID}:${config.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            redirect_uri: config.TWITTER_CALLBACK_URL,
            code_verifier: codeVerifier,
          }),
        });

        if (!tokenRes.ok) {
          const errBody = await tokenRes.text();
          log.error('Twitter token exchange failed', { status: tokenRes.status, body: errBody });
          return reply.redirect(`${config.FRONTEND_URL}?auth_error=token_exchange_failed`);
        }

        const tokenData = await tokenRes.json() as { access_token: string };

        // Fetch user profile
        const userRes = await fetch(
          'https://api.twitter.com/2/users/me?user.fields=id,username,name,profile_image_url',
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );

        if (!userRes.ok) {
          return reply.redirect(`${config.FRONTEND_URL}?auth_error=profile_fetch_failed`);
        }

        const userData = await userRes.json() as {
          data: { id: string; username: string; name: string; profile_image_url?: string };
        };

        const { id: twitterId, username, profile_image_url } = userData.data;

        const user = await findOrCreateTwitterUser(twitterId, username, profile_image_url ?? null);
        const session = await createSession(user.id, request);
        setSessionCookie(reply, session.id);

        return reply.redirect(config.FRONTEND_URL);
      } catch (err) {
        log.error('Twitter OAuth callback error', { err });
        return reply.redirect(`${config.FRONTEND_URL}?auth_error=server_error`);
      }
    }
  );

  // ─── Magic Link Auth ────────────────────────────────────

  app.post(
    '/auth/email/send',
    async (
      request: FastifyRequest<{ Body: { email: string } }>,
      reply: FastifyReply
    ) => {
      const { email } = request.body ?? {};
      if (!email) {
        return reply.status(400).send({ error: 'email is required' });
      }

      try {
        await sendMagicLink(email);
      } catch (err) {
        // Log but don't expose errors to prevent email enumeration
        log.warn('Magic link send error', { err });
      }

      // Always return 200 to prevent email enumeration
      return reply.send({ ok: true });
    }
  );

  app.post(
    '/auth/email/verify',
    async (
      request: FastifyRequest<{ Body: { token: string } }>,
      reply: FastifyReply
    ) => {
      const { token } = request.body ?? {};
      if (!token) {
        return reply.status(400).send({ error: 'token is required' });
      }

      try {
        const user = await verifyMagicToken(token);
        const session = await createSession(user.id, request);
        setSessionCookie(reply, session.id);
        return reply.send({ user: sanitizeUser(user) });
      } catch (err) {
        return reply.status(401).send({ error: (err as Error).message });
      }
    }
  );

  // ─── Session Management ─────────────────────────────────

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies?.['lr_session'];
    if (sessionId) {
      await revokeSession(sessionId);
    }
    reply.clearCookie('lr_session', { path: '/' });
    return reply.send({ ok: true });
  });

  app.get(
    '/auth/me',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const u = request.user!;
      return reply.send({
        user: {
          ...u,
          plan: u.plan.toLowerCase(),
          trialPlan: u.trialPlan?.toLowerCase() ?? null,
        },
      });
    }
  );

  app.get(
    '/auth/sessions',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessions = await getUserSessions(request.user!.id);
      return reply.send({
        sessions: sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          country: s.country,
          city: s.city,
          isCurrent: s.id === request.sessionId,
        })),
      });
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/auth/sessions/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      // Only allow revoking own sessions
      const sessions = await getUserSessions(request.user!.id);
      const target = sessions.find((s) => s.id === request.params.id);
      if (!target) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      await revokeSession(request.params.id);
      return reply.send({ ok: true });
    }
  );

  // Revoke all sessions except current
  app.delete(
    '/auth/sessions',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessions = await getUserSessions(request.user!.id);
      const others = sessions.filter((s) => s.id !== request.sessionId);
      await Promise.all(others.map((s) => revokeSession(s.id)));
      return reply.send({ ok: true, revoked: others.length });
    }
  );
}

function sanitizeUser(user: {
  id: string;
  walletAddress?: string | null;
  twitterId?: string | null;
  twitterHandle?: string | null;
  twitterAvatar?: string | null;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  createdAt?: Date;
}) {
  return {
    id: user.id,
    walletAddress: user.walletAddress ?? null,
    twitterHandle: user.twitterHandle ?? null,
    twitterAvatar: user.twitterAvatar ?? null,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    isAdmin: user.isAdmin ?? false,
    createdAt: user.createdAt,
  };
}
