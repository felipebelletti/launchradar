import { XCircle, RotateCcw } from 'lucide-react';
import { useDiscardStore } from '../../store/discard.store';
import { useFloatingTooltip } from '../../hooks/useFloatingTooltip';

export function DiscardButton({
  launchId,
  size = 14,
  className = '',
}: {
  launchId: string;
  size?: number;
  className?: string;
}) {
  const discarded = useDiscardStore((s) => s.discardedIds.has(launchId));
  const toggle = useDiscardStore((s) => s.toggleDiscard);
  const actionLabel = discarded ? 'Restore launch' : 'Discard launch';
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
          discarded
            ? 'text-rose-400 hover:text-rose-300'
            : 'text-radar-muted/40 hover:text-rose-400'
        } ${className}`}
      >
        {discarded ? <RotateCcw size={size} /> : <XCircle size={size} />}
      </button>
      {tooltip}
    </>
  );
}
