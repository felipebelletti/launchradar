import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/app.store';

export function NewPill() {
  const queryClient = useQueryClient();
  const count = useAppStore((s) => s.pendingCount);
  const pendingIds = useAppStore((s) => s.pendingIds);
  const flushPending = useAppStore((s) => s.flushPending);
  const setHighlightedLaunchIds = useAppStore((s) => s.setHighlightedLaunchIds);
  const clearHighlightedLaunchIds = useAppStore((s) => s.clearHighlightedLaunchIds);
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (count === 0) return null;

  async function handleClick() {
    const ids = [...new Set(pendingIds)];
    const scrollToId = ids[0];
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current);
      highlightClearTimerRef.current = null;
    }
    setHighlightedLaunchIds(ids);
    highlightClearTimerRef.current = setTimeout(() => {
      clearHighlightedLaunchIds();
      highlightClearTimerRef.current = null;
    }, 12_000);
    flushPending();
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['launches'] }),
      queryClient.refetchQueries({ queryKey: ['calendar'] }),
    ]);
    if (!scrollToId) return;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const el = document.querySelector(`[data-launch-card="${CSS.escape(scrollToId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    });
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold
                 bg-radar-amber/15 text-radar-amber border border-radar-amber/30
                 hover:bg-radar-amber/25 transition-colors glow-amber whitespace-nowrap flex-shrink-0"
    >
      <span className="text-[10px]">{'\u25B2'}</span>
      {count} NEW SIGNAL{count > 1 ? 'S' : ''}
    </button>
  );
}
