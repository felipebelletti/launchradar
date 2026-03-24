import type { IngestTiming, TweetTimeBadge } from '@prisma/client';
import type { LaunchTiming } from '../ai/classifier.js';

export function launchTimingToIngestTiming(t: LaunchTiming): IngestTiming {
  if (t === 'future') return 'FUTURE';
  if (t === 'live') return 'LIVE';
  return 'UNKNOWN';
}

export function initialTimeBadgeFromLaunchTiming(t: LaunchTiming): {
  timeBadge: TweetTimeBadge;
  timeBadgeDetail: number | null;
} {
  if (t === 'live') return { timeBadge: 'LIVE_NOW', timeBadgeDetail: null };
  if (t === 'future') return { timeBadge: 'UPCOMING', timeBadgeDetail: null };
  return { timeBadge: 'TIME_UNKNOWN', timeBadgeDetail: null };
}

export function timeBadgeFromLaunchDate(
  launchDate: Date,
  now: Date = new Date()
): { timeBadge: TweetTimeBadge; timeBadgeDetail: number | null } {
  if (launchDate.getTime() < now.getTime()) {
    return { timeBadge: 'LATER', timeBadgeDetail: null };
  }

  const ms = launchDate.getTime() - now.getTime();
  const oneHourMs = 60 * 60 * 1000;
  const inOneHour = new Date(now.getTime() + oneHourMs);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (ms <= oneHourMs) {
    return { timeBadge: 'NEXT_HOUR', timeBadgeDetail: null };
  }

  if (launchDate.getTime() <= endOfDay.getTime()) {
    return { timeBadge: 'TODAY', timeBadgeDetail: null };
  }

  const daysCeil = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (daysCeil >= 2 && daysCeil <= 7) {
    return { timeBadge: 'IN_N_DAYS', timeBadgeDetail: daysCeil };
  }

  if (launchDate.getTime() <= inOneWeek.getTime()) {
    return { timeBadge: 'THIS_WEEK', timeBadgeDetail: null };
  }

  return { timeBadge: 'LATER', timeBadgeDetail: null };
}
