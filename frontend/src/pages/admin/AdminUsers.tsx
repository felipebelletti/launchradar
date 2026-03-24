import { useState, useEffect } from 'react';
import { Search, Wallet, Twitter, Mail, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AdminUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  twitterHandle: string | null;
  email: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  lastActiveAt: string | null;
  createdAt: string;
  authMethod: 'wallet' | 'twitter' | 'email';
  flagCount: number;
  sessionCount: number;
}

interface Props {
  onSelectUser: (id: string) => void;
}

export function AdminUsers({ onSelectUser }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (search) params.set('search', search);

    const res = await fetch(`/admin/users?${params}`, { credentials: 'include' });
    const data = (await res.json()) as {
      data: AdminUser[];
      pagination: { totalPages: number };
    };
    setUsers(data.data);
    setTotalPages(data.pagination.totalPages);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const AuthIcon = ({ method }: { method: string }) => {
    if (method === 'wallet') return <Wallet size={12} className="text-radar-amber" />;
    if (method === 'twitter') return <Twitter size={12} className="text-radar-cyan" />;
    return <Mail size={12} className="text-radar-muted" />;
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-radar-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, wallet, handle, or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10
              text-radar-text text-sm placeholder:text-radar-muted
              focus:outline-none focus:border-radar-amber/50"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-white/10 text-radar-text text-sm
            hover:bg-white/15 transition-colors cursor-pointer"
        >
          Search
        </button>
      </form>

      {/* Table */}
      {loading ? (
        <div className="text-radar-muted text-sm">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-radar-muted text-xs uppercase tracking-wider border-b border-radar-border">
                <th className="text-left py-2 px-3">User</th>
                <th className="text-left py-2 px-3">Auth</th>
                <th className="text-left py-2 px-3">Joined</th>
                <th className="text-left py-2 px-3">Last Active</th>
                <th className="text-left py-2 px-3">Flags</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => onSelectUser(user.id)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10" />
                      )}
                      <span className="text-radar-text">
                        {user.displayName ?? user.twitterHandle ?? user.email ?? truncateWallet(user.walletAddress)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <AuthIcon method={user.authMethod} />
                  </td>
                  <td className="py-2 px-3 text-radar-muted">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                  <td className="py-2 px-3 text-radar-muted">
                    {user.lastActiveAt
                      ? formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })
                      : 'never'}
                  </td>
                  <td className="py-2 px-3">
                    {user.flagCount > 0 ? (
                      <span className="flex items-center gap-1 text-radar-orange">
                        <AlertTriangle size={12} />
                        {user.flagCount}
                      </span>
                    ) : (
                      <span className="text-radar-muted">0</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {user.isSuspended ? (
                      <span className="text-radar-red text-xs px-2 py-0.5 rounded bg-red-500/10">
                        Suspended
                      </span>
                    ) : (
                      <span className="text-green-400 text-xs px-2 py-0.5 rounded bg-green-500/10">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded bg-white/5 text-radar-muted
              hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-radar-muted">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm rounded bg-white/5 text-radar-muted
              hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function truncateWallet(addr: string | null): string {
  if (!addr) return 'Unknown';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
