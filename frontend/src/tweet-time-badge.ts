import type { TweetTimeBadge } from './types';

export function formatTweetTimeBadgeTimeline(
  badge: TweetTimeBadge | null | undefined,
  timeBadgeDetail: number | null | undefined
): string | null {
  if (!badge) return null;
  switch (badge) {
    case 'LIVE_NOW':
      return 'Tweet reads like the launch is live now';
    case 'NEXT_HOUR':
      return 'Suggested launch within the next hour';
    case 'TODAY':
      return 'Suggested launch later today';
    case 'THIS_WEEK':
      return 'Suggested launch within the next week';
    case 'LATER':
      return 'Suggested launch further out';
    case 'IN_N_DAYS': {
      const n = timeBadgeDetail != null && timeBadgeDetail > 0 ? timeBadgeDetail : null;
      if (n === 1) return 'Suggested launch in about one day';
      if (n != null) return `Suggested launch in about ${n} days`;
      return 'Suggested launch a few days out';
    }
    case 'UPCOMING':
      return 'Upcoming launch hinted; no exact time parsed';
    case 'TIME_UNKNOWN':
      return 'No clear launch time in this tweet';
    case 'RESCHEDULED':
      return 'Launch was rescheduled from an earlier estimate';
    case 'NO_DATE':
      return null;
    default:
      return null;
  }
}

export function formatTweetTimeBadge(
  badge: TweetTimeBadge | null | undefined,
  timeBadgeDetail: number | null | undefined
): string | null {
  if (!badge) return null;
  switch (badge) {
    case 'LIVE_NOW':
      return 'LIVE NOW';
    case 'NEXT_HOUR':
      return 'NEXT HOUR';
    case 'TODAY':
      return 'TODAY';
    case 'THIS_WEEK':
      return 'THIS WEEK';
    case 'LATER':
      return 'LATER';
    case 'IN_N_DAYS':
      return timeBadgeDetail != null && timeBadgeDetail > 0
        ? `IN ${timeBadgeDetail} DAYS`
        : 'IN N DAYS';
    case 'UPCOMING':
      return 'UPCOMING';
    case 'TIME_UNKNOWN':
      return null;
    case 'RESCHEDULED':
      return 'RESCHEDULED';
    case 'NO_DATE':
      return null;
    default:
      return null;
  }
}
