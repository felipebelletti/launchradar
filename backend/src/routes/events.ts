import type { FastifyInstance } from 'fastify';
import { redis } from '../redis.js';
import { createChildLogger } from '../logger.js';
import { prisma } from '../db/client.js';
import { hasPlan } from '../services/plan.service.js';

const log = createChildLogger('sse');

const FREE_VISIBLE_STATUSES = new Set(['VERIFIED', 'LIVE']);

interface LaunchPayload {
  id: string;
  status: string;
  projectName: string;
  chain: string | null;
  createdAt: string;
  updatedAt: string;
  confidenceScore: number;
  ruleSource: string;
  [key: string]: unknown;
}

function redactPayload(p: LaunchPayload): Record<string, unknown> {
  return {
    id: p.id,
    status: p.status,
    chain: p.chain,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    confidenceScore: p.confidenceScore,
    ruleSource: p.ruleSource,
    redacted: true,
    projectName: '█'.repeat((p.projectName ?? '').length || 6),
    ticker: null,
    launchDate: null,
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

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', async (request, reply) => {
    // Resolve plan once at connection time
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

    // Disable Fastify's default response handling — we're streaming manually
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? '*',
    });
    reply.raw.flushHeaders();

    reply.raw.write('event: connected\ndata: {}\n\n');

    // Each SSE client gets its own Redis subscriber connection
    // Do NOT reuse the main redis client — subscribe() changes connection mode
    const subscriber = redis.duplicate();
    await subscriber.subscribe('launches:events');

    // Keep-alive ping every 20s prevents proxies and browsers from closing idle connections
    const pingInterval = setInterval(() => {
      reply.raw.write('event: ping\ndata: {}\n\n');
    }, 20000);

    subscriber.on('message', (_channel: string, message: string) => {
      try {
        if (!isPaid) {
          const event = JSON.parse(message) as { type: string; payload: LaunchPayload };
          if (
            (event.type === 'launch:new' || event.type === 'launch:updated') &&
            !FREE_VISIBLE_STATUSES.has(event.payload.status)
          ) {
            const redacted = { type: event.type, payload: redactPayload(event.payload) };
            reply.raw.write(`data: ${JSON.stringify(redacted)}\n\n`);
            return;
          }
        }
        // SSE format: each event is "data: <json>\n\n"
        reply.raw.write(`data: ${message}\n\n`);
      } catch (err) {
        log.warn('Failed to write SSE event to client', { err });
      }
    });

    subscriber.on('error', (err) => {
      log.error('SSE Redis subscriber error', { err });
    });

    // Clean up when the client disconnects (tab closed, navigation, network drop)
    request.raw.on('close', async () => {
      clearInterval(pingInterval);
      try {
        await subscriber.unsubscribe('launches:events');
        await subscriber.quit();
      } catch (err) {
        log.warn('Error cleaning up SSE subscriber', { err });
      }
      log.debug('SSE client disconnected');
    });

    log.debug('SSE client connected');
  });
}
