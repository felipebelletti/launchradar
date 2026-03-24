import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './requireAuth.js';

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);

  // If requireAuth already sent a 401, don't continue
  if (reply.sent) return;

  if (!request.user?.isAdmin) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
}
