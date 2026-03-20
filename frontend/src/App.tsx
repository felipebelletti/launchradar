import { useEffect } from 'react';
import { useAppStore } from './store/app.store';
import { useRealtimeEvents } from './hooks/useRealtimeEvents';
import { TopNav } from './components/layout/TopNav';
import { TerminalLayout } from './components/layout/TerminalLayout';
import { SimpleLayout } from './components/layout/SimpleLayout';
import { LaunchDrawer } from './components/drawer/LaunchDrawer';

export function App() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  useRealtimeEvents();

  // Force simple mode on small screens
  useEffect(() => {
    function check() {
      if (window.innerWidth < 768) setMode('simple');
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [setMode]);

  return (
    <div className="min-h-screen bg-radar-bg">
      <TopNav />
      {mode === 'terminal' ? <TerminalLayout /> : <SimpleLayout />}
      <LaunchDrawer />
    </div>
  );
}
