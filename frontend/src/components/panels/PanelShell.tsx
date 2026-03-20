import { X, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

export function PanelShell({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border border-radar-border bg-radar-panel backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-radar-border cursor-move select-none drag-handle">
        <div className="flex items-center gap-2">
          <span className="text-radar-amber text-xs">{'\u25C8'}</span>
          <h2 className="text-xs font-mono font-bold tracking-widest text-radar-muted uppercase">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {onClose && (
            <>
              <button className="p-1 hover:text-radar-text text-radar-muted transition-colors">
                <Settings size={12} />
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:text-radar-red text-radar-muted transition-colors"
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
