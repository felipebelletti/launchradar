import { Trash2, Ban, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTrashBin } from '../../hooks/useTrashBin';
import { useDiscardStore } from '../../store/discard.store';
import { useAppStore } from '../../store/app.store';
import { PanelShell } from './PanelShell';
import { PlatformTag } from '../shared/PlatformTag';
import { CategoryBadge } from '../shared/CategoryBadge';
import type { LaunchRecord } from '../../types';

export function TrashBinPanel({ onClose }: { onClose?: () => void }) {
  const { data: launches, isLoading } = useTrashBin();

  return (
    <PanelShell
      title="TRASH BIN"
      panelId="trash"
      icon={Trash2}
      iconColor="text-zinc-400"
      onClose={onClose}
      className="border-zinc-600/25 bg-[linear-gradient(180deg,rgba(40,40,45,0.32)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(161,161,170,0.06)]"
    >
      {isLoading && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          SCANNING...
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {launches?.map((launch) => (
          <TrashRow key={launch.id} launch={launch} reason={launch.trashReason} />
        ))}
      </AnimatePresence>
      {!isLoading && (!launches || launches.length === 0) && (
        <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-center px-2">
          <Trash2 size={20} className="text-zinc-600 mb-2" />
          <p className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 mb-1">
            TRASH IS EMPTY
          </p>
          <p className="text-[10px] font-mono text-radar-muted/50">
            Cancelled and discarded launches appear here.
          </p>
        </div>
      )}
    </PanelShell>
  );
}

function TrashRow({ launch, reason }: { launch: LaunchRecord; reason: 'cancelled' | 'discarded' }) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const toggleDiscard = useDiscardStore((s) => s.toggleDiscard);
  const isDiscarded = useDiscardStore((s) => s.discardedIds.has(launch.id));

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
      onClick={() => openDrawer(launch.id)}
      className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03] cursor-pointer transition-colors rounded min-w-0 overflow-hidden group"
      style={{ opacity: 0.7 }}
    >
      {reason === 'cancelled' ? (
        <Ban size={12} className="text-rose-400/70 flex-shrink-0" />
      ) : (
        <XCircle size={12} className="text-zinc-500 flex-shrink-0" />
      )}
      <span className="flex-1 font-mono text-sm truncate min-w-0 text-zinc-400 line-through decoration-zinc-600">
        {launch.projectName}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <PlatformTag platform={launch.platform} />
        <CategoryBadge category={launch.primaryCategory} />
        <span className={`text-[10px] font-mono font-bold tracking-wider ${
          reason === 'cancelled' ? 'text-rose-400/60' : 'text-zinc-500'
        }`}>
          {reason === 'cancelled' ? 'CANCELLED' : 'DISCARDED'}
        </span>
        {isDiscarded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDiscard(launch.id);
            }}
            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
            title="Restore"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
