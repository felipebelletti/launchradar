import { Ban } from 'lucide-react';

export function CancelledLaunchBanner() {
  return (
    <div
      className="mx-6 mt-4 mb-0 flex gap-3 rounded-lg border border-rose-500/25 bg-linear-to-br from-rose-950/50 to-rose-950/20 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.12)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-rose-500/30 bg-rose-950/60">
        <Ban className="h-4 w-4 text-rose-400" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-rose-300">
          LAUNCH CANCELLED
        </p>
        <p className="mt-1 text-xs leading-relaxed text-radar-muted">
          This project is no longer scheduled. Details below are kept for reference only.
        </p>
      </div>
    </div>
  );
}
