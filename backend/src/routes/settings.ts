import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';

interface PatchSettingsBody {
  minFollowers?: number | null;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /settings — return current user's settings
  app.get('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    return reply.status(200).send({
      data: {
        minFollowers: settings?.minFollowers ?? null,
      },
    });
  });

  // PATCH /settings — update current user's settings
  app.patch(
    '/settings',
    async (
      request: FastifyRequest<{ Body: PatchSettingsBody }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const { minFollowers } = request.body ?? {};

      // Validate
      if (minFollowers !== undefined && minFollowers !== null) {
        if (typeof minFollowers !== 'number' || !Number.isInteger(minFollowers) || minFollowers < 0) {
          return reply.status(400).send({ error: 'minFollowers must be a non-negative integer or null' });
        }
      }

      const settings = await prisma.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          minFollowers: minFollowers ?? null,
        },
        update: {
          minFollowers: minFollowers ?? null,
        },
      });

      return reply.status(200).send({
        data: {
          minFollowers: settings.minFollowers,
        },
      });
    },
  );
}
