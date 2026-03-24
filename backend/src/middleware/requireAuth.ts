import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSessionUser } from '../services/auth.service.js';
import { prisma } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      walletAddress: string | null;
      twitterId: string | null;
      twitterHandle: string | null;
      twitterAvatar: string | null;
      email: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      isAdmin: boolean;
      isSuspended: boolean;
      createdAt: Date;
      plan: string;
      trialPlan: string | null;
      trialExpiresAt: Date | null;
      trialUsed: boolean;
    };
    sessionId?: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = request.cookies?.['lr_session'];
  if (!sessionId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const user = await getSessionUser(sessionId);
  if (!user || user.isSuspended) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  request.user = {
    id: user.id,
    walletAddress: user.walletAddress,
    twitterId: user.twitterId,
    twitterHandle: user.twitterHandle,
    twitterAvatar: user.twitterAvatar,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    isSuspended: user.isSuspended,
    createdAt: user.createdAt,
    plan: user.plan,
    trialPlan: user.trialPlan,
    trialExpiresAt: user.trialExpiresAt,
    trialUsed: user.trialUsed,
  };
  request.sessionId = sessionId;

  // Update lastSeenAt in background
  prisma.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});
}
