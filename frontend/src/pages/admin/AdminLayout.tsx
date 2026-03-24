import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard,
  Users,
  Flag,
  ArrowLeft,
} from 'lucide-react';
import { AdminOverview } from './AdminOverview';
import { AdminUsers } from './AdminUsers';
import { AdminUserDetail } from './AdminUserDetail';
import { AdminFlags } from './AdminFlags';

type AdminView =
  | { page: 'overview' }
  | { page: 'users' }
  | { page: 'user-detail'; userId: string }
  | { page: 'flags' };

export function AdminLayout({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [view, setView] = useState<AdminView>({ page: 'overview' });

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-radar-bg flex items-center justify-center">
        <p className="text-radar-red">Access denied</p>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'flags', label: 'Flags', icon: Flag },
  ] as const;

  return (
    <div className="min-h-screen bg-radar-bg">
      {/* Top bar */}
      <div className="border-b border-radar-border px-4 py-3 flex items-center gap-4">
        <button
          onClick={onClose}
          className="text-radar-muted hover:text-radar-text transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-xl text-radar-amber tracking-wider">
          ADMIN
        </h1>
        <div className="flex-1" />
        <nav className="flex gap-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView({ page: id } as AdminView)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                view.page === id
                  ? 'bg-white/10 text-radar-text'
                  : 'text-radar-muted hover:text-radar-text'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {view.page === 'overview' && <AdminOverview />}
        {view.page === 'users' && (
          <AdminUsers
            onSelectUser={(id) =>
              setView({ page: 'user-detail', userId: id })
            }
          />
        )}
        {view.page === 'user-detail' && (
          <AdminUserDetail
            userId={view.userId}
            onBack={() => setView({ page: 'users' })}
          />
        )}
        {view.page === 'flags' && <AdminFlags />}
      </div>
    </div>
  );
}
