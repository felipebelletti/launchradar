import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { LoginPage } from './LoginPage';
import { TrialBanner } from '../layout/TrialBanner';

function SplashScreen() {
  return (
    <div className="min-h-screen bg-radar-bg flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-3xl text-radar-amber tracking-wider animate-pulse">
          ◈ LAUNCHRADAR
        </h1>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  // Fetch user settings from DB once authenticated (syncs into app store)
  useSettings();

  if (isLoading) return <SplashScreen />;
  if (!isAuthenticated) return <LoginPage />;
  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
}
