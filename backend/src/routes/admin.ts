import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { redis } from '../redis.js';
import { createChildLogger } from '../logger.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { revokeAllUserSessions } from '../services/auth.service.js';
import { getAlphaGateStatus, loadCursor } from '../services/alphagate.service.js';

const log = createChildLogger('admin-routes');

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // All admin routes require admin auth
  app.addHook('preHandler', requireAdmin);

  // ─── Overview Stats ─────────────────────────────────────

  app.get('/admin/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeToday, activeWeek, newSignups, flagCounts, planCounts, trialAbuseCount, subCounts] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: { lastActiveAt: { gte: todayStart } },
        }),
        prisma.user.count({
          where: { lastActiveAt: { gte: weekAgo } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: weekAgo } },
        }),
        prisma.locationFlag.groupBy({
          by: ['severity'],
          where: { reviewedAt: null },
          _count: true,
        }),
        prisma.user.groupBy({
          by: ['plan'],
          _count: true,
        }),
        prisma.adminFlag.count({
          where: { type: 'TRIAL_FINGERPRINT_REUSE', reviewed: false },
        }),
        prisma.subscription.groupBy({
          by: ['plan'],
          where: { status: 'ACTIVE' },
          _count: true,
        }),
      ]);

    const flags: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of flagCounts) {
      flags[f.severity] = f._count;
    }

    const planDistribution: Record<string, number> = { FREE: 0, SCOUT: 0, ALPHA: 0, PRO: 0 };
    for (const p of planCounts) {
      planDistribution[p.plan] = p._count;
    }

    // Calculate MRR from active subscriptions
    const priceMap: Record<string, number> = { SCOUT: 19, ALPHA: 49, PRO: 99 };
    let mrr = 0;
    for (const s of subCounts) {
      mrr += (priceMap[s.plan] ?? 0) * s._count;
    }

    return reply.send({
      totalUsers,
      activeToday,
      activeWeek,
      newSignups,
      openFlags: flags,
      planDistribution,
      trialAbuseCount,
      mrr,
      arr: mrr * 12,
    });
  });

  // ─── User List ──────────────────────────────────────────

  app.get(
    '/admin/users',
    async (
      request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
      reply: FastifyReply
    ) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;
      const search = request.query.search?.trim();

      const where = search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { walletAddress: { contains: search, mode: 'insensitive' as const } },
              { twitterHandle: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            _count: { select: { locationFlags: true, sessions: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({
        data: users.map((u) => ({
          id: u.id,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl ?? u.twitterAvatar,
          walletAddress: u.walletAddress,
          twitterHandle: u.twitterHandle,
          email: u.email,
          isAdmin: u.isAdmin,
          isSuspended: u.isSuspended,
          lastActiveAt: u.lastActiveAt,
          createdAt: u.createdAt,
          authMethod: u.walletAddress ? 'wallet' : u.twitterId ? 'twitter' : 'email',
          flagCount: u._count.locationFlags,
          sessionCount: u._count.sessions,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );

  // ─── User Detail ────────────────────────────────────────

  app.get(
    '/admin/users/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
        include: {
          sessions: {
            where: { isActive: true },
            orderBy: { lastSeenAt: 'desc' },
          },
          locationFlags: {
            orderBy: { createdAt: 'desc' },
          },
          subscription: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ data: user });
    }
  );

  // ─── User Actions ──────────────────────────────────────

  app.post(
    '/admin/users/:id/warn',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // TODO: Send warning email via Resend if user has email
      log.info('User warned', { userId: user.id, adminId: request.user!.id });
      return reply.send({ ok: true, message: 'Warning sent' });
    }
  );

  app.post(
    '/admin/users/:id/suspend',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply
    ) => {
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedReason: (request.body as { reason?: string })?.reason ?? 'Suspended by admin',
        },
      });

      // Revoke all sessions
      await revokeAllUserSessions(user.id);

      log.info('User suspended', { userId: user.id, adminId: request.user!.id });
      return reply.send({ ok: true });
    }
  );

  app.post(
    '/admin/users/:id/unsuspend',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      await prisma.user.update({
        where: { id: request.params.id },
        data: {
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
        },
      });

      log.info('User unsuspended', { userId: request.params.id, adminId: request.user!.id });
      return reply.send({ ok: true });
    }
  );

  app.delete(
    '/admin/users/:id/sessions',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      await revokeAllUserSessions(request.params.id);
      log.info('All sessions revoked', { userId: request.params.id, adminId: request.user!.id });
      return reply.send({ ok: true });
    }
  );

  // ─── Flags ─────────────────────────────────────────────

  app.get(
    '/admin/flags',
    async (
      request: FastifyRequest<{
        Querystring: {
          page?: string;
          limit?: string;
          severity?: string;
          reviewed?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (request.query.severity) {
        where.severity = request.query.severity.toUpperCase();
      }
      if (request.query.reviewed === 'true') {
        where.reviewedAt = { not: null };
      } else if (request.query.reviewed === 'false') {
        where.reviewedAt = null;
      }

      const [flags, total] = await Promise.all([
        prisma.locationFlag.findMany({
          where,
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                twitterHandle: true,
                walletAddress: true,
                email: true,
              },
            },
          },
        }),
        prisma.locationFlag.count({ where }),
      ]);

      // Fetch session details for each flag
      const enrichedFlags = await Promise.all(
        flags.map(async (flag) => {
          const [session1, session2] = await Promise.all([
            prisma.session.findUnique({ where: { id: flag.session1Id } }),
            prisma.session.findUnique({ where: { id: flag.session2Id } }),
          ]);
          return {
            ...flag,
            session1: session1
              ? { country: session1.country, city: session1.city, latitude: session1.latitude, longitude: session1.longitude }
              : null,
            session2: session2
              ? { country: session2.country, city: session2.city, latitude: session2.latitude, longitude: session2.longitude }
              : null,
          };
        })
      );

      return reply.send({
        data: enrichedFlags,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );

  app.post(
    '/admin/flags/:id/review',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { action: string };
      }>,
      reply: FastifyReply
    ) => {
      const { action } = (request.body ?? {}) as { action?: string };
      if (!action || !['dismissed', 'warned', 'suspended'].includes(action)) {
        return reply.status(400).send({ error: 'action must be: dismissed, warned, or suspended' });
      }

      const flag = await prisma.locationFlag.findUnique({
        where: { id: request.params.id },
      });

      if (!flag) {
        return reply.status(404).send({ error: 'Flag not found' });
      }

      await prisma.locationFlag.update({
        where: { id: flag.id },
        data: {
          reviewedAt: new Date(),
          reviewedBy: request.user!.id,
          action,
        },
      });

      // If action is suspend, actually suspend the user
      if (action === 'suspended') {
        await prisma.user.update({
          where: { id: flag.userId },
          data: {
            isSuspended: true,
            suspendedAt: new Date(),
            suspendedReason: `Suspended via flag review: ${flag.reason}`,
          },
        });
        await revokeAllUserSessions(flag.userId);
      }

      log.info('Flag reviewed', { flagId: flag.id, action, adminId: request.user!.id });
      return reply.send({ ok: true });
    }
  );

  // ─── Trial Abuse Flags ────────────────────────────────────

  app.get(
    '/admin/trial-flags',
    async (
      request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; reviewed?: string };
      }>,
      reply: FastifyReply
    ) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { type: 'TRIAL_FINGERPRINT_REUSE' };
      if (request.query.reviewed === 'true') {
        where.reviewed = true;
      } else if (request.query.reviewed === 'false') {
        where.reviewed = false;
      }

      const [flags, total] = await Promise.all([
        prisma.adminFlag.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.adminFlag.count({ where }),
      ]);

      return reply.send({
        data: flags,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );

  app.post(
    '/admin/trial-flags/:id/review',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { action: string };
      }>,
      reply: FastifyReply
    ) => {
      const { action } = (request.body ?? {}) as { action?: string };
      if (!action || !['dismissed', 'blocked'].includes(action)) {
        return reply.status(400).send({ error: 'action must be: dismissed or blocked' });
      }

      await prisma.adminFlag.update({
        where: { id: request.params.id },
        data: { reviewed: true },
      });

      log.info('Trial flag reviewed', { flagId: request.params.id, action, adminId: request.user!.id });
      return reply.send({ ok: true });
    }
  );

  // ─── AlphaGate Stats ──────────────────────────────────

  app.get('/admin/alphagate', async (_request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [status, cursor, processedCount, lastProcessedRaw, totalSources, sourcesToday, sources24h, recentRecords] =
      await Promise.all([
        getAlphaGateStatus(),
        loadCursor(),
        redis.get('alphagate:processed_count'),
        redis.get('alphagate:last_processed'),
        prisma.launchSource.count({ where: { type: 'ALPHAGATE' } }),
        prisma.launchSource.count({ where: { type: 'ALPHAGATE', createdAt: { gte: todayStart } } }),
        prisma.launchSource.count({ where: { type: 'ALPHAGATE', createdAt: { gte: last24h } } }),
        prisma.launchRecord.findMany({
          where: { sources: { some: { type: 'ALPHAGATE' } }, createdAt: { gte: last24h } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            projectName: true,
            twitterHandle: true,
            chain: true,
            status: true,
            confidenceScore: true,
            createdAt: true,
          },
        }),
      ]);

    let lastProcessed = null;
    if (lastProcessedRaw) {
      try { lastProcessed = JSON.parse(lastProcessedRaw); } catch { /* ignore */ }
    }

    return reply.send({
      socket: {
        status: status.socketStatus ?? 'unknown',
        connectedAt: status.connectedAt ?? null,
        disconnectedAt: status.disconnectedAt ?? null,
        lastError: status.lastError ?? null,
        errorAt: status.errorAt ?? null,
      },
      stream: {
        mode: status.mode ?? 'unknown',
        liveAt: status.liveAt ?? null,
        lastBackfillAt: status.lastBackfillAt ?? null,
        lastBackfillCount: status.lastBackfillCount ? parseInt(status.lastBackfillCount, 10) : 0,
      },
      cursor: {
        value: cursor,
        date: new Date(cursor * 1000).toISOString(),
      },
      stats: {
        totalProcessed: processedCount ? parseInt(processedCount, 10) : 0,
        totalSources,
        sourcesToday,
        sources24h,
        lastProcessed,
      },
      recentRecords,
    });
  });
}
