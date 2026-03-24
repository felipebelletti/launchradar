import { useState, useRef, useEffect } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { useNotificationStore } from '../../store/notification.store';
import { playSound, SOUND_LABELS } from '../../lib/sounds';
import type { NotificationSound } from '../../store/notification.store';

const SOUND_OPTIONS: NotificationSound[] = ['ping', 'radar', 'alert', 'chime', 'blip', 'none'];

export function PanelSettingsPopover({ panelId, children }: { panelId: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { getPanelSettings, setPanelSettings } = useNotificationStore();
  const settings = useNotificationStore((s) => s.panelSettings[panelId]) ?? getPanelSettings(panelId);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 hover:text-radar-amber text-radar-muted transition-colors"
        title="Panel settings"
      >
        {children ?? <Settings size={12} />}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-radar-border bg-[#14141f] shadow-2xl p-3 font-mono text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <h3 className="text-radar-amber font-bold tracking-widest mb-3 text-[10px]">
            NOTIFICATIONS
          </h3>

          {/* Enable toggle */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-radar-muted">Enabled</span>
            <button
              onClick={() => setPanelSettings(panelId, { enabled: !settings.enabled })}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                settings.enabled ? 'bg-radar-amber' : 'bg-radar-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sound select */}
          <div className="mb-3">
            <span className="text-radar-muted block mb-1">Sound</span>
            <div className="grid grid-cols-2 gap-1">
              {SOUND_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setPanelSettings(panelId, { sound: s });
                    if (s !== 'none') playSound(s, settings.volume);
                  }}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    settings.sound === s
                      ? 'bg-radar-amber/20 text-radar-amber border border-radar-amber/40'
                      : 'bg-radar-border/30 text-radar-muted hover:text-white border border-transparent'
                  }`}
                >
                  {SOUND_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Volume slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-radar-muted">Volume</span>
              {settings.volume > 0 ? (
                <Volume2 size={10} className="text-radar-muted" />
              ) : (
                <VolumeX size={10} className="text-radar-muted" />
              )}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => setPanelSettings(panelId, { volume: Number(e.target.value) / 100 })}
              className="w-full h-1 rounded-full appearance-none bg-radar-border accent-radar-amber cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
