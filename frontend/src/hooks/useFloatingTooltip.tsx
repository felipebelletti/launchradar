import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'above' | 'below';

export function useFloatingTooltip(label: string) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; placement: Placement }>({
    left: 0,
    top: 0,
    placement: 'above',
  });

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const estimatedH = 36;
    const placeBelow = r.top < estimatedH + gap;
    setPos({
      left: r.left + r.width / 2,
      top: placeBelow ? r.bottom + gap : r.top - gap,
      placement: placeBelow ? 'below' : 'above',
    });
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  useEffect(() => {
    if (!visible) return;
    function handle() {
      setVisible(false);
    }
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [visible]);

  const tooltip =
    visible && typeof document !== 'undefined'
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              transform: pos.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              zIndex: 10000,
            }}
            className="pointer-events-none w-max rounded border border-radar-border bg-[#14141f] px-2.5 py-1.5 text-[9px] font-mono font-bold tracking-wide text-radar-muted shadow-lg whitespace-nowrap text-center"
            aria-hidden
          >
            {label}
          </span>,
          document.body
        )
      : null;

  return { ref, onMouseEnter: show, onMouseLeave: hide, tooltip };
}
