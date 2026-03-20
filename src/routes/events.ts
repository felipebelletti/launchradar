import type { FastifyInstance } from 'fastify';
import { redis } from '../redis.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('sse');

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', async (request, reply) => {
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
