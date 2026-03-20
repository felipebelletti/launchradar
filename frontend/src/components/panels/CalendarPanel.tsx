import { useCalendar } from '../../hooks/useCalendar';
import { useAppStore } from '../../store/app.store';
import { PanelShell } from './PanelShell';
import { LaunchCard } from '../cards/LaunchCard';
import { GatedContent } from '../shared/GatedContent';
import type { LaunchRecord } from '../../types';

const COLUMNS = [
  { key: 'hour', label: 'NEXT HOUR', requiredPlan: null },
  { key: 'today', label: 'TODAY', requiredPlan: null },
  { key: 'week', label: 'THIS WEEK', requiredPlan: 'scout' as const },
  { key: 'live', label: 'LIVE', requiredPlan: null },
  { key: 'tbd', label: 'TBD', requiredPlan: 'alpha' as const },
] as const;

export function CalendarPanel({ onClose }: { onClose?: () => void }) {
  const { data, isLoading } = useCalendar();
  const plan = useAppStore((s) => s.plan);

  return (
    <PanelShell title="LAUNCH CALENDAR" onClose={onClose}>
      {isLoading && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          SCANNING...
        </div>
      )}
      {data && (
        <div className="grid grid-cols-5 gap-3 h-full">
          {COLUMNS.map((col) => {
            const launches = (data[col.key] ?? []) as LaunchRecord[];
            const content = (
              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-mono font-bold tracking-widest text-radar-muted border-b border-radar-border pb-1 mb-1">
                  {col.label}
                </h3>
                {launches.length === 0 && (
                  <p className="text-[10px] font-mono text-radar-muted/50 text-center py-4">
                    NO SIGNALS IN RANGE
                  </p>
                )}
                {launches.map((l) => (
                  <LaunchCard key={l.id} launch={l} />
                ))}
              </div>
            );

            if (col.requiredPlan) {
              return (
                <div key={col.key}>
                  <GatedContent
                    requiredPlan={col.requiredPlan}
                    currentPlan={plan}
                    ctaText={`CLASSIFIED \u2014 UPGRADE TO ${col.requiredPlan.toUpperCase()}`}
                  >
                    {content}
                  </GatedContent>
                </div>
              );
            }

            return <div key={col.key}>{content}</div>;
          })}
        </div>
      )}
      {!isLoading && !data && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          NO SIGNALS IN RANGE
        </div>
      )}
    </PanelShell>
  );
}
