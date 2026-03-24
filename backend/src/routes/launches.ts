import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { createChildLogger } from '../logger.js';
import { getPrimarySignalTweetUrlForLaunch } from '../tweet-url.js';
import type { LaunchStatus, Prisma } from '@prisma/client';
import { getEffectivePlan, hasPlan } from '../services/plan.service.js';

const log = createChildLogger('launches');

const FREE_VISIBLE_STATUSES = new Set<string>(['VERIFIED', 'LIVE']);

/** Redact sensitive fields from a launch record, keeping chain/status/dates for UI rendering */
function redactLaunch(s: Record<string, unknown>): Record<string, unknown> {
  return {
    id: s.id,
    status: s.status,
    chain: s.chain,
    launchDate: s.launchDate,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    confidenceScore: s.confidenceScore,
    ruleSource: s.ruleSource,
    redacted: true,
    projectName: '█'.repeat(((s.projectName as string) ?? '').length || 6),
    ticker: null,
    launchDateRaw: null,
    launchDateConfidence: null,
    previousLaunchDate: null,
    rescheduledAt: null,
    launchType: null,
    categories: [],
    primaryCategory: null,
    website: null,
    whitepaper: null,
    summary: null,
    twitterHandle: null,
    twitterFollowers: null,
    isVerifiedAccount: false,
    sources: [],
    tweets: [],
    launchedAt: null,
    sourceTweetUrl: null,
  };
}

/** Apply redaction to an array of launches based on plan */
function redactLaunches(launches: Record<string, unknown>[], isPaid: boolean): Record<string, unknown>[] {
  return launches.map((s) => {
    if (isPaid || FREE_VISIBLE_STATUSES.has(s.status as string)) {
      return { ...s, redacted: false };
    }
    return redactLaunch(s);
  });
}

interface LaunchListQuery {
  page?: string;
  limit?: string;
  status?: string;
  chain?: string;
  category?: string;
  timeframe?: string;
  minFollowers?: string;
}

const VALID_STATUSES: LaunchStatus[] = [
  'STUB',
  'PARTIAL',
  'CONFIRMED',
  'VERIFIED',
  'LIVE',
  'STALE',
  'CANCELLED',
];

const CHAIN_SLUG_ALIASES: Record<string, readonly string[]> = {
  solana: ['solana', 'sol'],
  ethereum: ['ethereum', 'eth'],
  base: ['base'],
  bsc: ['bsc', 'binance', 'bnb'],
  pump: ['pump', 'pump.fun', 'pumpfun'],
};

function expandChainSlugs(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const raw of slugs) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const aliases = CHAIN_SLUG_ALIASES[key];
    if (aliases) {
      for (const a of aliases) out.add(a);
    } else {
      out.add(raw.trim());
    }
  }
  return [...out];
}

function chainWhere(chainParam: string | undefined): Prisma.LaunchRecordWhereInput | undefined {
  if (!chainParam?.trim()) return undefined;
  const values = expandChainSlugs(chainParam.split(',').map((c) => c.trim()).filter(Boolean));
  if (values.length === 0) return undefined;
  if (values.length === 1) {
    return { chain: { equals: values[0]!, mode: 'insensitive' } };
  }
  return { OR: values.map((v) => ({ chain: { equals: v, mode: 'insensitive' } })) };
}

function categoryWhere(categoryParam: string | undefined): Prisma.LaunchRecordWhereInput | undefined {
  if (!categoryParam?.trim()) return undefined;
  const values = [...new Set(categoryParam.split(',').map((c) => c.trim()).filter(Boolean))];
  if (values.length === 0) return undefined;
  return { categories: { hasSome: values } };
}

function buildWhere(query: LaunchListQuery): Prisma.LaunchRecordWhereInput {
  const and: Prisma.LaunchRecordWhereInput[] = [];

  if (query.status) {
    const requested = query.status
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => VALID_STATUSES.includes(s as LaunchStatus)) as LaunchStatus[];
    if (requested.length > 0) {
      and.push({ status: { in: requested } });
    }
  } else {
    and.push({ status: { in: ['STUB', 'PARTIAL', 'CONFIRMED', 'VERIFIED', 'LIVE'] } });
  }

  const chainClause = chainWhere(query.chain);
  if (chainClause) and.push(chainClause);

  const categoryClause = categoryWhere(query.category);
  if (categoryClause) and.push(categoryClause);

  if (query.minFollowers) {
    const min = parseInt(query.minFollowers, 10);
    if (!Number.isNaN(min) && min > 0) {
      and.push({ twitterFollowers: { gte: min } });
    }
  }

  if (query.timeframe) {
    const now = new Date();
    switch (query.timeframe) {
      case 'hour': {
        const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
        and.push({ launchDate: { gte: now, lte: inOneHour } });
        break;
      }
      case 'today': {
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        and.push({ launchDate: { gte: now, lte: endOfDay } });
        break;
      }
      case 'week': {
        const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        and.push({ launchDate: { gte: now, lte: inOneWeek } });
        break;
      }
      case 'tbd': {
        and.push({ launchDate: null });
        break;
      }
    }
  }

  return and.length === 1 ? and[0]! : { AND: and };
}

export async function registerLaunchRoutes(
  app: FastifyInstance,
  authHook?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
): Promise<void> {
  // Wrap in a scoped plugin so the preHandler only applies to launch routes
  app.register(async (scope) => {
    if (authHook) {
      scope.addHook('preHandler', authHook);
    }

    registerLaunchRoutesInner(scope);
  });
}

function registerLaunchRoutesInner(app: FastifyInstance): void {
  // GET /launches/intelligence — stats + recent signals
  app.get(
    '/launches/intelligence',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Resolve plan for signal list gating
      let isPaid = false;
      if (request.user) {
        const userWithSub = await prisma.user.findUnique({
          where: { id: request.user.id },
          include: { subscription: true },
        });
        if (userWithSub) {
          isPaid = hasPlan(userWithSub, 'SCOUT');
        }
      }

      // Stats — no plan gating on counts
      const [signalsToday, cryptoConfirmed, currentlyTracking, launchedToday] =
        await Promise.all([
          prisma.tweetSignal.count({ where: { ingestedAt: { gte: todayStart } } }),
          prisma.launchRecord.count({ where: { createdAt: { gte: todayStart } } }),
          prisma.monitoredAccount.count({ where: { active: true } }),
          prisma.launchRecord.count({
            where: { status: 'LIVE', launchedAt: { gte: todayStart } },
          }),
        ]);

      // Chain distribution — from confirmed launches today
      const chainCounts = await prisma.launchRecord.groupBy({
        by: ['chain'],
        where: {
          createdAt: { gte: todayStart },
          chain: { not: null },
          status: { notIn: ['STUB', 'STALE', 'CANCELLED'] },
        },
        _count: { chain: true },
        orderBy: { _count: { chain: 'desc' } },
        take: 3,
      });

      const total = chainCounts.reduce((sum, c) => sum + c._count.chain, 0);
      const chainDistribution = chainCounts.map((c) => ({
        chain: c.chain!,
        count: c._count.chain,
        pct: total > 0 ? Math.round((c._count.chain / total) * 100) : 0,
      }));

      // Last signal
      const lastSignal = await prisma.launchRecord.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { projectName: true, chain: true, createdAt: true, status: true },
      });

      // Signal list — always fetch recent, redact sensitive fields for free users
      const signals = await prisma.launchRecord.findMany({
        where: {
          createdAt: { gte: yesterday },
          status: { notIn: ['STALE', 'CANCELLED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const redactedSignals = redactLaunches(
        signals as unknown as Record<string, unknown>[],
        isPaid,
      );

      return reply.send({
        stats: {
          signalsToday,
          cryptoConfirmed,
          currentlyTracking,
          launchedToday,
          chainDistribution,
          lastSignal: lastSignal
            ? {
                projectName:
                  !isPaid && !FREE_VISIBLE_STATUSES.has(lastSignal.status)
                    ? '█'.repeat(lastSignal.projectName.length)
                    : lastSignal.projectName,
                chain: lastSignal.chain,
                detectedAt: lastSignal.createdAt.toISOString(),
              }
            : null,
        },
        signals: redactedSignals,
      });
    },
  );

  // GET /launches — paginated list with filters
  app.get(
    '/launches',
    async (request: FastifyRequest<{ Querystring: LaunchListQuery }>, reply: FastifyReply) => {
      const pageNum = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const skip = (pageNum - 1) * limitNum;

      const where = buildWhere(request.query);

      // Plan-based gating: free users get 48h delay + limited statuses
      if (request.user) {
        const userWithSub = await prisma.user.findUnique({
          where: { id: request.user.id },
          include: { subscription: true },
        });
        if (userWithSub && !hasPlan(userWithSub, 'SCOUT')) {
          // Free users: only launches older than 48h
          const delay48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
          (where as Record<string, unknown>).createdAt = { lte: delay48h };
          // Free users: only PARTIAL+ statuses (no STUB)
          (where as Record<string, unknown>).status = {
            in: ['PARTIAL', 'CONFIRMED', 'VERIFIED', 'LIVE'] as LaunchStatus[],
          };
        }
      }

      const [launches, total] = await Promise.all([
        prisma.launchRecord.findMany({
          where,
          orderBy: [
            { confidenceScore: 'desc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: limitNum,
          include: {
            tweets: { orderBy: { createdAt: 'desc' }, take: 3 },
            sources: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        }),
        prisma.launchRecord.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return reply.status(200).send({
        data: launches,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      });
    }
  );

  // GET /launches/calendar — grouped by timeframe bucket
  app.get(
    '/launches/calendar',

    async (request: FastifyRequest<{ Querystring: LaunchListQuery }>, reply: FastifyReply) => {
      const baseWhere = buildWhere({ ...request.query, timeframe: undefined });

      // Resolve plan for redaction
      let isPaid = false;
      if (request.user) {
        const userWithSub = await prisma.user.findUnique({
          where: { id: request.user.id },
          include: { subscription: true },
        });
        if (userWithSub) {
          isPaid = hasPlan(userWithSub, 'SCOUT');
        }
      }

      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const include = {
        tweets: { orderBy: { createdAt: 'desc' as const }, take: 1 },
      };

      const activeStatus = { notIn: ['LIVE', 'CANCELLED', 'STALE'] as LaunchStatus[] };

      const [live, hour, today, week, tbd] = await Promise.all([
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: 'LIVE' },
          orderBy: { launchedAt: 'desc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: activeStatus, launchDate: { gte: now, lte: inOneHour } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: activeStatus, launchDate: { gt: inOneHour, lte: endOfDay } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: activeStatus, launchDate: { gt: endOfDay, lte: inOneWeek } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: activeStatus, launchDate: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include,
        }),
      ]);

      const r = (arr: unknown[]) => redactLaunches(arr as Record<string, unknown>[], isPaid);

      return reply.status(200).send({
        data: {
          hour: r(hour),
          today: r(today),
          week: r(week),
          live: r(live),
          tbd: r(tbd),
        },
      });
    }
  );

  // GET /launches/:id — single launch with all relations
  app.get(
    '/launches/:id',

    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const launch = await prisma.launchRecord.findUnique({
        where: { id: request.params.id },
        include: {
          tweets: { orderBy: { createdAt: 'desc' } },
          sources: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!launch) {
        return reply.status(404).send({ error: 'Launch not found' });
      }

      const sourceTweetUrl = await getPrimarySignalTweetUrlForLaunch(launch.id);

      return reply.status(200).send({
        data: { ...launch, sourceTweetUrl },
      });
    }
  );
}
