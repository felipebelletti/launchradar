import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAppStore } from './store/app.store';
import { useRealtimeEvents } from './hooks/useRealtimeEvents';
import { TopNav } from './components/layout/TopNav';
import { TerminalLayout } from './components/layout/TerminalLayout';
import { SimpleLayout } from './components/layout/SimpleLayout';
import { LaunchDrawer } from './components/drawer/LaunchDrawer';
import { NotificationPopup } from './components/shared/NotificationPopup';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AccountPage } from './pages/AccountPage';
import { PricingPage } from './pages/PricingPage';

function Dashboard() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const [showAdmin, setShowAdmin] = useState(false);
  const navigate = useNavigate();

  // Force simple mode on small screens
  useEffect(() => {
    function check() {
      if (window.innerWidth < 768) setMode('simple');
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [setMode]);

  if (showAdmin) {
    return <AdminLayout onClose={() => setShowAdmin(false)} />;
  }

  return (
    <div className="min-h-screen bg-radar-bg">
      <TopNav
        onOpenAdmin={() => setShowAdmin(true)}
        onNavigate={(path) => navigate(path)}
      />
      {mode === 'terminal' ? <TerminalLayout /> : <SimpleLayout />}
      <LaunchDrawer />
      <NotificationPopup />
    </div>
  );
}

export function App() {
  const navigate = useNavigate();

  useRealtimeEvents();

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route
        path="/account"
        element={<AccountPage initialTab="profile" onBack={() => navigate('/')} />}
      />
      <Route
        path="/account/billing"
        element={<AccountPage initialTab="billing" onBack={() => navigate('/')} />}
      />
      <Route
        path="/account/sessions"
        element={<AccountPage initialTab="sessions" onBack={() => navigate('/')} />}
      />
      <Route
        path="/pricing"
        element={<PricingPage onBack={() => navigate('/')} />}
      />
      {/* Fallback to dashboard */}
      <Route path="*" element={<Dashboard />} />
    </Routes>
  );
}
