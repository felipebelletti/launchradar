import { formatDistanceToNow } from 'date-fns';
import type { LaunchRecord } from '../../types';

interface TimelineEntry {
  time: string;
  label: string;
}

function buildTimeline(launch: LaunchRecord): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  entries.push({
    time: formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true }),
    label: `Signal detected via ${launch.ruleSource.toLowerCase().replace('_', ' ')} rule`,
  });

  if (launch.twitterFollowers != null) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Author profile scraped (${launch.twitterFollowers.toLocaleString()} followers)`,
    });
  }

  if (launch.chain) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: `Chain confirmed: ${launch.chain}`,
    });
  }

  if (launch.launchDate) {
    entries.push({
      time: formatDistanceToNow(new Date(launch.updatedAt), { addSuffix: true }),
      label: 'Launch date extracted',
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
