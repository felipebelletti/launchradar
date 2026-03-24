import { useState, useRef, useEffect } from 'react';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useNotificationStore } from '../../store/notification.store';
import { playSound, SOUND_LABELS } from '../../lib/sounds';
import type { NotificationSound } from '../../store/notification.store';
import { useFloatingTooltip } from '../../hooks/useFloatingTooltip';

const SOUND_OPTIONS: NotificationSound[] = ['ping', 'radar', 'alert', 'chime', 'blip', 'none'];

const BELL_TOOLTIP = 'Notification settings for this launch';

export function WatchItemSettings({ launchId }: { launchId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: bellButtonRef, onMouseEnter, onMouseLeave, tooltip } = useFloatingTooltip(BELL_TOOLTIP);
  const panelId = `watchlist:${launchId}`;
  const { getPanelSettings, setPanelSettings } = useNotificationStore();
  const itemSettings = useNotificationStore((s) => s.panelSettings[panelId]);
  const defaultSettings = useNotificationStore((s) => s.panelSettings['watchlist']) ?? getPanelSettings('watchlist');
  const hasOverride = itemSettings !== undefined;
  const settings = itemSettings ?? defaultSettings;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function enableOverride() {
    setPanelSettings(panelId, { ...defaultSettings });
  }

  function removeOverride() {
    // Remove the per-item settings by setting to match default (the notification store
    // will still have the key, but we can signal "no override" by deleting it)
    const store = useNotificationStore.getState();
    const updated = { ...store.panelSettings };
    delete updated[panelId];
    localStorage.setItem('launchradar:notifications', JSON.stringify(updated));
    useNotificationStore.setState({ panelSettings: updated });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={bellButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`p-1 transition-colors flex-shrink-0 ${
          hasOverride ? 'text-sky-400 hover:text-sky-300' : 'text-radar-muted/40 hover:text-sky-400'
        }`}
        aria-label={BELL_TOOLTIP}
      >
        <Bell size={12} />
      </button>
      {tooltip}

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-radar-border bg-[#14141f] shadow-2xl p-3 font-mono text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <h3 className="text-sky-400 font-bold tracking-widest mb-2 text-[10px]">
            SOUND OVERRIDE
          </h3>

          {!hasOverride ? (
            <div>
              <p className="text-[10px] text-radar-muted/70 mb-2">
                Using watchlist default ({SOUND_LABELS[defaultSettings.sound]})
              </p>
              <button
                onClick={enableOverride}
                className="w-full py-1.5 rounded text-[10px] bg-sky-400/10 text-sky-400 border border-sky-400/30 hover:bg-sky-400/20 transition-colors"
              >
                CUSTOMIZE SOUND
              </button>
            </div>
          ) : (
            <div>
              {/* Sound select */}
              <div className="mb-2">
                <div className="grid grid-cols-3 gap-1">
                  {SOUND_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setPanelSettings(panelId, { sound: s });
                        if (s !== 'none') playSound(s, settings.volume);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                        settings.sound === s
                          ? 'bg-sky-400/20 text-sky-400 border border-sky-400/40'
                          : 'bg-radar-border/30 text-radar-muted hover:text-white border border-transparent'
                      }`}
                    >
                      {SOUND_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume slider */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-radar-muted text-[10px]">Volume</span>
                  {settings.volume > 0 ? (
                    <Volume2 size={9} className="text-radar-muted" />
                  ) : (
                    <VolumeX size={9} className="text-radar-muted" />
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.volume * 100)}
                  onChange={(e) => setPanelSettings(panelId, { volume: Number(e.target.value) / 100 })}
                  className="w-full h-1 rounded-full appearance-none bg-radar-border accent-sky-400 cursor-pointer"
                />
              </div>

              <button
                onClick={removeOverride}
                className="w-full py-1 rounded text-[10px] text-radar-muted border border-radar-border/50 hover:text-white hover:border-radar-border transition-colors"
              >
                RESET TO DEFAULT
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
