import type { LaunchRecord } from '../../types';

const SEGMENTS = [
  { key: 'projectName', label: 'Name' },
  { key: 'chain', label: 'Chain' },
  { key: 'launchDate', label: 'Date' },
  { key: 'website', label: 'Web' },
] as const;

export function ConfidenceBar({ launch, showLabels = false }: { launch: LaunchRecord; showLabels?: boolean }) {
  const filled = SEGMENTS.map((s) => {
    const val = launch[s.key];
    return val !== null && val !== undefined && val !== '';
  });

  return (
    <div className="flex items-center gap-0.5">
      {SEGMENTS.map((seg, i) => (
        <div key={seg.key} className="flex flex-col items-center">
          <div
            className="h-1.5 rounded-sm transition-colors"
            style={{
              width: showLabels ? 48 : 16,
              backgroundColor: filled[i] ? '#F5C542' : 'rgba(255,255,255,0.08)',
            }}
          />
          {showLabels && (
            <span className="text-[10px] mt-1 font-mono" style={{ color: filled[i] ? '#F5C542' : '#6B7280' }}>
              {seg.label} {filled[i] ? '\u2713' : '\u2717'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
