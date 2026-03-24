import { useAppStore } from '../../store/app.store';

export function ConnectionDot() {
  const connected = useAppStore((s) => s.connected);

  if (connected) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded
                      bg-emerald-400/10 border border-emerald-400/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-400 text-[10px] font-mono tracking-widest">ONLINE</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded
                    bg-red-400/10 border border-red-400/20">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      <span className="text-red-400 text-[10px] font-mono tracking-widest">OFFLINE</span>
    </div>
  );
}
