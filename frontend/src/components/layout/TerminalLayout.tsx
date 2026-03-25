import { useState, useCallback, useRef, useEffect } from 'react';
import { Responsive } from 'react-grid-layout';
import type { Layout, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useAppStore, LAYOUT_STORAGE_KEY } from '../../store/app.store';
import { CalendarPanel } from '../panels/CalendarPanel';
import { SignalIntelligencePanel } from '../panels/SignalIntelligencePanel';
import { PlatformFilterPanel } from '../panels/PlatformFilterPanel';
import { CategoryFilterPanel } from '../panels/CategoryFilterPanel';
import { WatchlistPanel } from '../panels/WatchlistPanel';
import { TrashBinPanel } from '../panels/TrashBinPanel';

const ROW_HEIGHT = 80;

const DEFAULT_LAYOUT: Layout[] = [
  { i: 'calendar',  x: 0, y: 0, w: 8, h: 6, minW: 4, minH: 4 },
  { i: 'signal-intel', x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'platform',  x: 0, y: 6, w: 2, h: 2, minW: 2, minH: 2 },
  { i: 'category',  x: 2, y: 6, w: 2, h: 2, minW: 2, minH: 2 },
  { i: 'trash',     x: 4, y: 6, w: 4, h: 4, minW: 2, minH: 3 },
  { i: 'watchlist', x: 8, y: 6, w: 4, h: 4, minW: 2, minH: 3 },
];

function loadLayout(): Layout[] {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Layout[];
      // Filter out removed panels (e.g. heatmap)
      const validIds = new Set(DEFAULT_LAYOUT.map((l) => l.i));
      const filtered = parsed.filter((l) => validIds.has(l.i));
      if (filtered.length > 0) return filtered;
    }
  } catch { /* use default */ }
  return DEFAULT_LAYOUT;
}

const PANELS: Record<string, (onClose: () => void) => React.ReactNode> = {
  'calendar':  (onClose) => <CalendarPanel onClose={onClose} />,
  'signal-intel': (onClose) => <SignalIntelligencePanel onClose={onClose} />,
  'platform':  (onClose) => <PlatformFilterPanel onClose={onClose} />,
  'category':  (onClose) => <CategoryFilterPanel onClose={onClose} />,
  'trash':     (onClose) => <TrashBinPanel onClose={onClose} />,
  'watchlist':  (onClose) => <WatchlistPanel onClose={onClose} />,
};

export function TerminalLayout() {
  const closedPanels = useAppStore((s) => s.closedPanels);
  const closePanel = useAppStore((s) => s.closePanel);
  const layoutVersion = useAppStore((s) => s.layoutVersion);
  const [layouts, setLayouts] = useState<Layout[]>(loadLayout);

  useEffect(() => {
    if (layoutVersion > 0) {
      setLayouts(DEFAULT_LAYOUT);
    }
  }, [layoutVersion]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth);
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const onLayoutChange = useCallback((layout: Layout[], _allLayouts: Layouts) => {
    // Merge updated positions for visible panels while preserving hidden panel layouts
    setLayouts((prev) => {
      const updated = new Map(layout.map((l) => [l.i, l]));
      const merged = prev.map((l) => updated.get(l.i) ?? l);
      // Add any new entries from layout that weren't in prev
      for (const l of layout) {
        if (!prev.some((p) => p.i === l.i)) merged.push(l);
      }
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const visiblePanels = layouts.filter((l) => !closedPanels.has(l.i));

  return (
    <div ref={containerRef} className="min-h-screen">
      <Responsive
        className="min-h-screen"
        width={width}
        layouts={{ lg: visiblePanels }}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={ROW_HEIGHT}
        onLayoutChange={onLayoutChange}
        isResizable
        resizeHandles={['s', 'e', 'w', 'n', 'se', 'sw', 'ne', 'nw']}
        draggableHandle=".drag-handle"
        draggableCancel=".no-grid-drag"
        containerPadding={[16, 16]}
        margin={[12, 12]}
        useCSSTransforms
      >
        {visiblePanels.map((l) => (
          <div key={l.i} className="h-full">
            {PANELS[l.i]?.(() => closePanel(l.i))}
          </div>
        ))}
      </Responsive>
    </div>
  );
}
