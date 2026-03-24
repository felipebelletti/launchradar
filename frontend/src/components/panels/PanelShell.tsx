import { X } from 'lucide-react';
import type { ReactNode, ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { PanelSettingsPopover } from './PanelSettingsPopover';

export function PanelShell({
  title,
  panelId,
  icon: Icon,
  iconColor = 'text-radar-amber',
  onClose,
  children,
  actions,
  className = '',
}: {
  title: string;
  panelId?: string;
  icon?: ComponentType<LucideProps>;
  iconColor?: string;
  onClose?: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col h-full rounded-lg border border-radar-border bg-radar-panel backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-radar-border cursor-move select-none drag-handle">
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon size={12} className={iconColor} />
          ) : (
            <span className="text-radar-amber text-xs">{'\u25C8'}</span>
          )}
          <h2 className="text-xs font-mono font-bold tracking-widest text-radar-muted uppercase">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {panelId && <PanelSettingsPopover panelId={panelId} />}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:text-radar-red text-radar-muted transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
