import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import type { AuthUser } from '../../store/auth.store';

interface EvmProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
}

interface PhantomSolana {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string; toBytes: () => Uint8Array } }>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
}

function getEvmProvider(): EvmProvider | null {
  const w = window as unknown as { ethereum?: EvmProvider };
  return w.ethereum ?? null;
}

function getSolanaProvider(): PhantomSolana | null {
  const w = window as unknown as { phantom?: { solana?: PhantomSolana }; solana?: PhantomSolana };
  return w.phantom?.solana ?? w.solana ?? null;
}

async function nonceAndVerify(
  walletAddress: string,
  signFn: (nonce: string) => Promise<string>,
  setUser: (user: AuthUser) => void
): Promise<string | null> {
  // Step 1: Get nonce
  const nonceRes = await fetch('/auth/wallet/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ walletAddress }),
  });
  if (!nonceRes.ok) return 'Failed to get nonce';
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  // Step 2: Sign
  const signature = await signFn(nonce);

  // Step 3: Verify
  const verifyRes = await fetch('/auth/wallet/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ walletAddress, signature }),
  });
  const data = (await verifyRes.json()) as { user?: AuthUser; error?: string };
  if (!verifyRes.ok) return data.error ?? 'Verification failed';
  if (data.user) setUser(data.user);
  return null;
}

type WalletType = 'solana' | 'evm';

export function WalletConnectButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const hasEvm = !!getEvmProvider();
  const hasSolana = !!getSolanaProvider();
  const hasBoth = hasEvm && hasSolana;

  const connectEvm = async () => {
    const ethereum = getEvmProvider();
    if (!ethereum) { setError('No EVM wallet found'); return; }

    const accounts = (await ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[];
    if (!accounts?.length) { setError('No account selected'); return; }

    const walletAddress = accounts[0]!;
    const err = await nonceAndVerify(walletAddress, async (nonce) => {
      return (await ethereum.request({
        method: 'personal_sign',
        params: [nonce, walletAddress],
      })) as string;
    }, setUser);
    if (err) setError(err);
  };

  const connectSolana = async () => {
    const solana = getSolanaProvider();
    if (!solana) { setError('No Solana wallet found'); return; }

    const resp = await solana.connect();
    const walletAddress = resp.publicKey.toString();

    const err = await nonceAndVerify(walletAddress, async (nonce) => {
      const encoded = new TextEncoder().encode(nonce);
      const { signature } = await solana.signMessage(encoded, 'utf8');
      return JSON.stringify(Array.from(signature));
    }, setUser);
    if (err) setError(err);
  };

  const handleConnect = async (type?: WalletType) => {
    // If both providers exist and no type chosen yet, show the picker
    if (hasBoth && !type) {
      setShowPicker(true);
      return;
    }

    setShowPicker(false);
    setError('');
    setLoading(true);
    try {
      const chain = type ?? (hasSolana ? 'solana' : 'evm');
      if (chain === 'solana') await connectSolana();
      else await connectEvm();
    } catch (err) {
      setError((err as Error).message ?? 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Main button */}
      <button
        onClick={() => handleConnect()}
        disabled={loading || (!hasEvm && !hasSolana)}
        className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg
          bg-radar-amber/10 border border-radar-amber/30 text-radar-amber font-medium
          hover:bg-radar-amber/20 hover:border-radar-amber/50
          disabled:opacity-50 transition-all cursor-pointer"
      >
        <Wallet size={20} />
        {loading ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {/* Inline chain picker — only shown when both providers detected */}
      {showPicker && (
        <div className="flex gap-2">
          <button
            onClick={() => handleConnect('solana')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-purple-500/10 border border-purple-500/25 text-purple-400 text-sm font-medium
              hover:bg-purple-500/20 hover:border-purple-500/40 transition-all cursor-pointer"
          >
            <SolanaIcon size={16} />
            Solana
          </button>
          <button
            onClick={() => handleConnect('evm')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-blue-500/10 border border-blue-500/25 text-blue-400 text-sm font-medium
              hover:bg-blue-500/20 hover:border-blue-500/40 transition-all cursor-pointer"
          >
            <EthIcon size={16} />
            Ethereum
          </button>
        </div>
      )}

      {!hasEvm && !hasSolana && (
        <p className="text-radar-muted text-xs text-center">
          No wallet detected. Install{' '}
          <a href="https://phantom.app" target="_blank" rel="noreferrer" className="underline">
            Phantom
          </a>{' '}
          or MetaMask.
        </p>
      )}
      {error && (
        <p className="text-radar-red text-xs text-center">{error}</p>
      )}
    </div>
  );
}

function SolanaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.5 18.5l3-3H20l-3 3H4.5z" fill="currentColor" />
      <path d="M4.5 5.5l3 3H20l-3-3H4.5z" fill="currentColor" />
      <path d="M4.5 12l3-3H20l-3 3H4.5z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function EthIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 1.5l-7 10.2L12 15l7-3.3L12 1.5z" fill="currentColor" opacity="0.6" />
      <path d="M5 11.7L12 22.5l7-10.8L12 15 5 11.7z" fill="currentColor" />
    </svg>
  );
}
