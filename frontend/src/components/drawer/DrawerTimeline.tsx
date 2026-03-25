import type { ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { LaunchRecord } from '../../types';
import { formatTweetTimeBadgeTimeline } from '../../tweet-time-badge';

interface TimelineEntry {
  time: string;
  label: ReactNode;
}

function formatLaunchDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildTimeline(launch: LaunchRecord): TimelineEntry[] {
  type Row = { at: number; time: string; label: ReactNode };
  const timed: Row[] = [];

  timed.push({
    at: new Date(launch.createdAt).getTime(),
    time: formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true }),
    label: `Signal detected via ${launch.ruleSource.toLowerCase().replace('_', ' ')} rule`,
  });

  const tweets = [...(launch.tweets ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const t of tweets) {
    const line = formatTweetTimeBadgeTimeline(t.timeBadge, t.timeBadgeDetail);
    if (!line) continue;
    timed.push({
      at: new Date(t.createdAt).getTime(),
      time: formatDistanceToNow(new Date(t.createdAt), { addSuffix: true }),
      label: line,
    });
  }

  if (launch.rescheduledAt) {
    const prev =
      launch.previousLaunchDate != null
        ? ` (was ${formatLaunchDateLabel(launch.previousLaunchDate)})`
        : '';
    timed.push({
      at: new Date(launch.rescheduledAt).getTime(),
      time: formatDistanceToNow(new Date(launch.rescheduledAt), { addSuffix: true }),
      label: `Launch rescheduled${prev}`,
    });
  }

  timed.sort((a, b) => a.at - b.at);

  const entries: TimelineEntry[] = timed.map(({ time, label }) => ({ time, label }));

  if (launch.twitterFollowers != null) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Author profile scraped (${launch.twitterFollowers.toLocaleString()} followers)`,
    });
  }

  if (launch.platform) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Platform confirmed: ${launch.platform}`,
    });
  }

  if (launch.launchDate) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Launch time on record: ${formatLaunchDateLabel(launch.launchDate)}`,
    });
  }

  if (launch.status !== 'STUB') {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Status \u2192 ${launch.status}`,
    });
  }

  return entries;
}

export function DrawerTimeline({ launch }: { launch: LaunchRecord }) {
  const entries = buildTimeline(launch);

  return (
    <div className="flex flex-col gap-0">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-3 pb-3">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-radar-amber mt-1" />
            {i < entries.length - 1 && <div className="w-px flex-1 bg-radar-border mt-1" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono text-radar-muted">{entry.time}</span>
            <p className="text-xs text-radar-text/80">{entry.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
