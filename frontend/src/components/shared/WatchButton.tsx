import { Eye, EyeOff } from 'lucide-react';
import { useWatchlistStore } from '../../store/watchlist.store';
import { useFloatingTooltip } from '../../hooks/useFloatingTooltip';

export function WatchButton({
  launchId,
  size = 14,
  className = '',
}: {
  launchId: string;
  size?: number;
  className?: string;
}) {
  const watched = useWatchlistStore((s) => s.watchedIds.has(launchId));
  const toggle = useWatchlistStore((s) => s.toggleWatch);
  const actionLabel = watched ? 'Remove from watchlist' : 'Add to watchlist';
  const { ref, onMouseEnter, onMouseLeave, tooltip } = useFloatingTooltip(actionLabel);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle(launchId);
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-label={actionLabel}
        className={`p-1 transition-colors flex-shrink-0 ${
          watched
            ? 'text-sky-400 hover:text-sky-300'
            : 'text-radar-muted/40 hover:text-sky-400'
        } ${className}`}
      >
        {watched ? <Eye size={size} /> : <EyeOff size={size} />}
      </button>
      {tooltip}
    </>
  );
}
