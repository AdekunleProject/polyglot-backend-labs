import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../api/notifications';

const POLL_INTERVAL_MS = 30000;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// No websocket/push infra exists on the backend, so this polls
// GET /notifications/unread-count every 30s rather than pushing updates —
// simple and good enough for an admin/customer dashboard context. Swap
// for a socket if real-time turns out to matter later.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poll = () => getUnreadCount().then(setUnreadCount).catch(() => {});
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listNotifications()
      .then(setNotifications)
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleClickNotification = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await markNotificationRead(n._id);
        setNotifications((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Non-critical — still navigate even if marking read failed.
      }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Leave state as-is on failure — next poll will reconcile it.
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center text-sm font-medium hover:text-rust transition-colors"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-rust text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-black/10 rounded-lg shadow-lg z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
            <p className="font-display font-600 text-sm">Notifications</p>
            {notifications.some((n) => !n.isRead) && (
              <button onClick={handleMarkAllRead} className="text-xs text-rust hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p className="label-eyebrow px-4 py-6 text-center">Loading&hellip;</p>
          ) : notifications.length === 0 ? (
            <p className="label-eyebrow px-4 py-6 text-center">No notifications yet.</p>
          ) : (
            <div>
              {notifications.map((n) => (
                <button
                  key={n._id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-manila/30 transition-colors ${
                    !n.isRead ? 'bg-manila/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-rust mt-1.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-inkfaint line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-inkfaint mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
