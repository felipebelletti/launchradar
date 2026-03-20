import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { createChildLogger } from '../logger.js';
import { getPrimarySignalTweetUrlForLaunch } from '../tweet-url.js';
import type { LaunchStatus, Prisma } from '@prisma/client';

const log = createChildLogger('launches');

interface LaunchListQuery {
  page?: string;
  limit?: string;
  status?: string;
  chain?: string;
  category?: string;
  timeframe?: string;
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
  if (values.length === 1) {
    return { category: { equals: values[0]!, mode: 'insensitive' } };
  }
  return { OR: values.map((v) => ({ category: { equals: v, mode: 'insensitive' } })) };
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

export async function registerLaunchRoutes(app: FastifyInstance): Promise<void> {
  // GET /launches — paginated list with filters
  app.get(
    '/launches',
    async (request: FastifyRequest<{ Querystring: LaunchListQuery }>, reply: FastifyReply) => {
      const pageNum = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const skip = (pageNum - 1) * limitNum;

      const where = buildWhere(request.query);

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

      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const include = {
        tweets: { orderBy: { createdAt: 'desc' as const }, take: 1 },
      };

      const [live, hour, today, week, tbd] = await Promise.all([
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: 'LIVE' },
          orderBy: { launchedAt: 'desc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: { not: 'LIVE' }, launchDate: { gte: now, lte: inOneHour } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: { not: 'LIVE' }, launchDate: { gt: inOneHour, lte: endOfDay } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: { not: 'LIVE' }, launchDate: { gt: endOfDay, lte: inOneWeek } },
          orderBy: { launchDate: 'asc' },
          take: 20,
          include,
        }),
        prisma.launchRecord.findMany({
          where: { ...baseWhere, status: { not: 'LIVE' }, launchDate: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include,
        }),
      ]);

      return reply.status(200).send({
        data: { hour, today, week, live, tbd },
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
