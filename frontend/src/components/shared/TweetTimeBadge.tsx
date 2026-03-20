import { formatTweetTimeBadge } from '../../tweet-time-badge';
import type { TweetTimeBadge } from '../../types';

export function TweetTimeBadgePill({
  badge,
  timeBadgeDetail,
}: {
  badge: TweetTimeBadge | null | undefined;
  timeBadgeDetail: number | null | undefined;
}) {
  const label = formatTweetTimeBadge(badge, timeBadgeDetail);
  if (!label) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-radar-amber bg-radar-amber/10 border border-radar-amber/25"
      title="Time signal extracted from this tweet"
    >
      {label}
    </span>
  );
}
