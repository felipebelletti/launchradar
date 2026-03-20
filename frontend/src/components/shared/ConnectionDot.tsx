import { useAppStore } from '../../store/app.store';

export function ConnectionDot() {
  const connected = useAppStore((s) => s.connected);

  return (
    <div className="flex items-center gap-1.5" title={connected ? 'Connected' : 'SIGNAL LOST \u2014 RECONNECTING'}>
      <div
        className="w-2 h-2 rounded-full transition-colors"
        style={{ backgroundColor: connected ? '#22C55E' : '#FF4444' }}
      />
      {!connected && (
        <span className="text-[10px] font-mono text-radar-red">RECONNECTING</span>
      )}
    </div>
  );
}
