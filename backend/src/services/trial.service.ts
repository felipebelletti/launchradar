import type { User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const logger = createChildLogger('trial');

export type TrialResult =
  | { activated: true }
  | { activated: false; reason: 'already_paid' | 'already_used' | 'fingerprint_reuse' };

export async function maybeStartTrial(user: User, fingerprint: string): Promise<TrialResult> {
  // Already on a paid plan — no trial needed
  if (user.plan !== 'FREE') return { activated: false, reason: 'already_paid' };

  // Trial already used or active
  if (user.trialUsed || user.trialExpiresAt) return { activated: false, reason: 'already_used' };

  // Check fingerprint abuse: has any other user trialed from this device?
  const fingerprintUsed = await prisma.user.findFirst({
    where: {
      trialFingerprint: fingerprint,
      trialUsed: true,
      id: { not: user.id },
    },
  });

  if (fingerprintUsed) {
    // Only flag once per user to avoid spam
    const existingFlag = await prisma.adminFlag.findFirst({
      where: { type: 'TRIAL_FINGERPRINT_REUSE', userId: user.id },
    });
    if (!existingFlag) {
      await prisma.adminFlag.create({
        data: {
          type: 'TRIAL_FINGERPRINT_REUSE',
          userId: user.id,
          detail: `Fingerprint ${fingerprint.slice(0, 12)}... already used by user ${fingerprintUsed.id}`,
        },
      });
    }
    logger.warn('Trial fingerprint reuse detected', { userId: user.id, fingerprint: fingerprint.slice(0, 12) });
    return { activated: false, reason: 'fingerprint_reuse' };
  }

  const now = new Date();
  const durationMs = config.TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      trialPlan: config.TRIAL_PLAN as 'FREE' | 'SCOUT' | 'ALPHA' | 'PRO',
      trialStartedAt: now,
      trialExpiresAt: new Date(now.getTime() + durationMs),
      trialFingerprint: fingerprint,
      trialUsed: true,
    },
  });

  logger.info('Trial started', { userId: user.id });
  return { activated: true };
}
