import { useState } from 'react';
import { Wallet, Twitter } from 'lucide-react';
import { WalletConnectButton } from './WalletConnectButton';
import { EmailAuthModal } from './EmailAuthModal';

export function LoginPage() {
  const [showEmail, setShowEmail] = useState(false);

  const handleTwitterLogin = () => {
    window.location.href = '/auth/twitter';
  };

  return (
    <div className="min-h-screen bg-radar-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div>
          <h1 className="font-display text-4xl text-radar-amber tracking-wider">
            ◈ LAUNCHRADAR
          </h1>
          <p className="text-radar-muted text-sm mt-2 font-mono">
            Real-time crypto launch intelligence
          </p>
        </div>

        {/* Auth buttons */}
        <div className="space-y-3">
          <WalletConnectButton />

          <button
            onClick={handleTwitterLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg
              bg-white/5 border border-white/10 text-radar-text font-medium
              hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
          >
            <Twitter size={20} />
            Sign in with X
          </button>
        </div>

        {/* Email fallback */}
        <button
          onClick={() => setShowEmail(true)}
          className="text-radar-muted text-sm hover:text-radar-text transition-colors cursor-pointer"
        >
          Or continue with email →
        </button>
      </div>

      {showEmail && <EmailAuthModal onClose={() => setShowEmail(false)} />}
    </div>
  );
}
