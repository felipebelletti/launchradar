import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio } from 'lucide-react';
import { useNotificationStore } from '../../store/notification.store';

const AUTO_DISMISS_MS = 5000;

export function NotificationPopup() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismissNotification);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm">
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => (
          <NotificationToast key={n.id} notification={n} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: { id: string; panelTitle: string; message: string; timestamp: number };
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="pointer-events-auto rounded-lg border border-radar-amber/30 bg-radar-panel/95 backdrop-blur-md shadow-lg shadow-radar-amber/5 overflow-hidden"
    >
      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        className="h-0.5 bg-radar-amber origin-left"
      />
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Radio size={12} className="text-radar-amber mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono font-bold tracking-widest text-radar-amber">
            {notification.panelTitle}
          </p>
          <p className="text-xs font-mono text-radar-muted mt-0.5 truncate">
            {notification.message}
          </p>
        </div>
        <button
          onClick={() => onDismiss(notification.id)}
          className="p-0.5 hover:text-radar-red text-radar-muted transition-colors shrink-0"
        >
          <X size={10} />
        </button>
      </div>
    </motion.div>
  );
}
