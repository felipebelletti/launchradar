import { io, type Socket } from 'socket.io-client';
import fetch from 'node-fetch';
import { config } from '../config.js';
import { redis } from '../redis.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('alphagate');

const BASE_URL = 'https://api.alphagate.io';
const CURSOR_KEY = 'alphagate:cursor';
const STATUS_KEY = 'alphagate:status';

/** Returns Unix timestamp (seconds) for the 1st of the current month at 00:00 UTC. */
function startOfCurrentMonthUnix(): number {
  const now = new Date();
  return Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000);
}

// ─── Status tracking (Redis) ────────────────────────────

async function setStatus(fields: Record<string, string>): Promise<void> {
  await redis.hset(STATUS_KEY, fields);
}

export async function getAlphaGateStatus(): Promise<Record<string, string>> {
  return redis.hgetall(STATUS_KEY);
}

// ─── AlphaGate project shape ─────────────────────────────

export interface AlphaGateProject {
  _id: string;
  id: string;
  name: string;
  username: string;
  description: string;
  profile_image_url: string;
  profile_banner_url?: string;
  created_at: string;
  timestamp: number;
  chain: string[];
  tag: string[];
  followers_count: number;
  key_followers_count: number;
  followers_when_found: number;
  contracts?: Record<string, unknown>;
  social?: { socials?: Array<{ type: string; url: string }> };
  entities?: { description?: Record<string, unknown> };
  dexscreener?: Record<string, unknown> | null;
  flag?: boolean;
  user_rating?: unknown;
  prev_usernames?: string[];
  parent_id?: string;
  unavailable?: boolean;
}

interface DiscoverResponse {
  message: string;
  data: {
    children: AlphaGateProject[];
    hasNext: boolean;
    hasTwoNext?: boolean;
  };
}

// ─── Cursor persistence (Redis) ──────────────────────────

export async function loadCursor(): Promise<number> {
  const stored = await redis.get(CURSOR_KEY);
  if (stored) return parseInt(stored, 10);
  return startOfCurrentMonthUnix();
}

export async function updateCursor(timestamp: number): Promise<void> {
  const current = await loadCursor();
  if (timestamp > current) {
    await redis.set(CURSOR_KEY, String(timestamp));
  }
}

// ─── HTTP fetch with retry ───────────────────────────────

function getCookieHeader(): string {
  return `${config.ALPHAGATE_COOKIE_NAME}=${config.ALPHAGATE_COOKIE_VALUE}`;
}

async function fetchWithRetry(
  url: string,
  maxRetries = 3
): Promise<DiscoverResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { Cookie: getCookieHeader() },
    });

    if (res.status === 503 && attempt < maxRetries - 1) {
      const delay = 1000 * Math.pow(2, attempt);
      log.warn('AlphaGate 503, retrying', { attempt: attempt + 1, delay });
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      log.error('AlphaGate auth failed — session cookie may be expired', {
        status: res.status,
      });
      throw new Error(`AlphaGate auth failed: ${res.status}`);
    }

    if (!res.ok) {
      throw new Error(`AlphaGate HTTP ${res.status}`);
    }

    return (await res.json()) as DiscoverResponse;
  }

  throw new Error('AlphaGate fetch exhausted retries');
}

// ─── REST backfill from cursor ───────────────────────────

export async function backfill(since: number): Promise<AlphaGateProject[]> {
  const results: AlphaGateProject[] = [];
  let page = 1;

  while (true) {
    const url =
      `${BASE_URL}/api/v1/child/discover?` +
      `ontop=false&page=${page}&limit=60&unfiltered=true&order=-1` +
      `&exclude_tags[]=Launched`;

    let res: DiscoverResponse;
    try {
      res = await fetchWithRetry(url);
    } catch (err) {
      log.error('Backfill page fetch failed', { page, err });
      break;
    }

    const { children, hasNext } = res.data;
    let done = false;

    for (const project of children) {
      if (project.timestamp > since) {
        results.push(project);
      } else {
        done = true;
        break;
      }
    }

    if (done || !hasNext) break;
    page++;

    // Rate limit politeness
    await new Promise((r) => setTimeout(r, 300));
  }

  log.info('Backfill complete', { projects: results.length, pages: page });
  return results;
}

// ─── Dedup helper ────────────────────────────────────────

export function deduplicateById(projects: AlphaGateProject[]): AlphaGateProject[] {
  const seen = new Set<string>();
  return projects.filter((p) => {
    if (seen.has(p._id)) return false;
    seen.add(p._id);
    return true;
  });
}

// ─── Socket.io real-time stream ──────────────────────────

export interface AlphaGateStreamManager {
  socket: Socket;
  stop: () => void;
}

export function startAlphaGateStream(
  processProject: (project: AlphaGateProject) => Promise<void>
): AlphaGateStreamManager {
  const buffer: AlphaGateProject[] = [];
  let isBackfilling = true;

  const socket = io(BASE_URL, {
    extraHeaders: { Cookie: getCookieHeader() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    log.info('AlphaGate socket connected');
    socket.emit('i_join_feed_room');
    setStatus({ socketStatus: 'connected', connectedAt: new Date().toISOString() });
  });

  socket.on('disconnect', (reason) => {
    log.warn('AlphaGate socket disconnected', { reason });
    setStatus({ socketStatus: 'disconnected', disconnectedAt: new Date().toISOString() });
  });

  socket.on('connect_error', (err) => {
    log.error('AlphaGate socket connection error', { message: err.message });
    setStatus({ socketStatus: 'error', lastError: err.message, errorAt: new Date().toISOString() });
  });

  // Step 2: buffer socket events during backfill
  socket.on('o_new_filtered_token', (data: unknown) => {
    const projects = Array.isArray(data) ? data : [data];
    const valid = projects.filter(
      (p): p is AlphaGateProject => p != null && typeof p === 'object' && '_id' in p
    );

    if (isBackfilling) {
      buffer.push(...valid);
    } else {
      // Live mode — process directly
      for (const project of valid) {
        processProject(project).catch((err) => {
          log.error('Failed to process live AlphaGate project', {
            projectId: project._id,
            err,
          });
        });
        updateCursor(project.timestamp).catch(() => {});
      }
    }
  });

  // Step 3+4+5: backfill then flush buffer then switch to live
  (async () => {
    try {
      const cursor = await loadCursor();
      log.info('Starting AlphaGate backfill', { cursor, cursorDate: new Date(cursor * 1000).toISOString() });

      const backfilled = await backfill(cursor);

      // Merge backfill + buffer, deduplicate
      const all = deduplicateById([...backfilled, ...buffer]);
      all.sort((a, b) => a.timestamp - b.timestamp);
      buffer.length = 0;

      log.info('Processing merged backfill + buffer', { count: all.length });
      await setStatus({
        lastBackfillAt: new Date().toISOString(),
        lastBackfillCount: String(all.length),
      });

      for (const project of all) {
        try {
          await processProject(project);
          await updateCursor(project.timestamp);
        } catch (err) {
          log.error('Failed to process backfill project', {
            projectId: project._id,
            name: project.name,
            err,
          });
        }
      }

      // Switch to live mode
      isBackfilling = false;
      log.info('AlphaGate switched to live stream mode');
      await setStatus({ mode: 'live', liveAt: new Date().toISOString() });
    } catch (err) {
      log.error('AlphaGate backfill failed', { err });
      isBackfilling = false; // still accept live events
    }
  })();

  // Step 6: handle reconnects — mini backfill from cursor
  socket.io.on('reconnect', () => {
    log.info('AlphaGate socket reconnected — running mini backfill');
    (async () => {
      try {
        const cursor = await loadCursor();
        const missed = await backfill(cursor);
        const deduped = deduplicateById(missed);
        deduped.sort((a, b) => a.timestamp - b.timestamp);

        for (const project of deduped) {
          try {
            await processProject(project);
            await updateCursor(project.timestamp);
          } catch (err) {
            log.error('Failed to process reconnect-backfill project', {
              projectId: project._id,
              err,
            });
          }
        }
      } catch (err) {
        log.error('Reconnect backfill failed', { err });
      }
    })();
  });

  return {
    socket,
    stop: () => {
      socket.disconnect();
      log.info('AlphaGate socket disconnected');
    },
  };
}
