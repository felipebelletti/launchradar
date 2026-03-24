import { useState } from 'react';
import type { Plan } from '../../types';

interface Props {
  targetPlan: Plan;
  className?: string;
  size?: 'xs' | 'sm';
}

export function UpgradeButton({ targetPlan, className = '', size = 'sm' }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: targetPlan.toUpperCase() }),
      });
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`bg-amber-400 text-black font-bold rounded
        hover:bg-amber-300 transition disabled:opacity-50 cursor-pointer ${
          size === 'xs'
            ? 'px-2 py-0.5 text-[9px]'
            : 'px-4 py-1.5 text-xs'
        } ${className}`}
    >
      {loading ? '...' : size === 'xs' ? `${targetPlan.toUpperCase()} →` : `Upgrade to ${targetPlan.toUpperCase()}`}
    </button>
  );
}
