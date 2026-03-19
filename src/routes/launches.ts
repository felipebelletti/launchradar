import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { createChildLogger } from '../logger.js';
import type { LaunchStatus } from '@prisma/client';

const log = createChildLogger('launches');

interface LaunchQueryParams {
  page?: string;
  limit?: string;
  status?: string;
}

const VALID_STATUSES: LaunchStatus[] = [
  'STUB',
  'PARTIAL',
  'CONFIRMED',
  'VERIFIED',
  'STALE',
  'CANCELLED',
];

const DEFAULT_STATUSES: LaunchStatus[] = ['CONFIRMED', 'VERIFIED'];

export async function registerLaunchRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/launches',
    async (request: FastifyRequest<{ Querystring: LaunchQueryParams }>, reply: FastifyReply) => {
      const pageNum = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10)));
      const skip = (pageNum - 1) * limitNum;

      // Determine which statuses to filter by
      let statusFilter: LaunchStatus[];
      if (request.query.status) {
        const requested = request.query.status.toUpperCase() as LaunchStatus;
        if (!VALID_STATUSES.includes(requested)) {
          return reply.status(400).send({
            error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}`,
          });
        }
        statusFilter = [requested];
      } else {
        statusFilter = DEFAULT_STATUSES;
      }

      const [launches, total] = await Promise.all([
        prisma.launchRecord.findMany({
          where: {
            status: { in: statusFilter },
          },
          orderBy: [
            { confidenceScore: 'desc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: limitNum,
          select: {
            id: true,
            projectName: true,
            ticker: true,
            launchDate: true,
            launchDateRaw: true,
            launchType: true,
            chain: true,
            category: true,
            website: true,
            twitterHandle: true,
            twitterFollowers: true,
            isVerifiedAccount: true,
            confidenceScore: true,
            status: true,
            ruleSource: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.launchRecord.count({
          where: {
            status: { in: statusFilter },
          },
        }),
      ]);

      const totalPages = Math.ceil(total / limitNum);

      log.info('Launch feed ranked', {
        count: launches.length,
        total,
        page: pageNum,
        limit: limitNum,
        statusFilter,
        orderBy: ['confidenceScore:desc', 'createdAt:desc'],
      });

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
}
