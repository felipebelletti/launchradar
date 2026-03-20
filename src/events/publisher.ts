import { redis } from '../redis.js';
import { createChildLogger } from '../logger.js';
import type { LaunchRecord } from '@prisma/client';

const log = createChildLogger('events:publisher');

export type LaunchRecordEventPayload = LaunchRecord & {
  sourceTweetUrl?: string | null;
};

type LaunchEvent =
  | { type: 'launch:new';       payload: LaunchRecordEventPayload }
  | { type: 'launch:updated';   payload: LaunchRecordEventPayload }
  | { type: 'launch:cancelled'; payload: { id: string } };

const CHANNEL = 'launches:events';

export async function publishEvent(event: LaunchEvent): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(event));
    if (event.type === 'launch:new' || event.type === 'launch:updated') {
      log.info('Published launch event', {
        type: event.type,
        launchId: event.payload.id,
        projectName: event.payload.projectName,
        sourceTweetUrl: event.payload.sourceTweetUrl ?? null,
      });
    } else {
      log.info('Published launch event', {
        type: event.type,
        launchId: event.payload.id,
      });
    }
  } catch (err) {
    log.warn('Failed to publish launch event', { type: event.type, err });
  }
}
