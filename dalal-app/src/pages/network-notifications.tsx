import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Bell, CheckCheck } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface NetworkNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NetworkNotificationsPage() {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<NetworkNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "office" && u.role !== "lawyer")) {
      navigate("/");
      return;
    }
    setRole(u.role);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<NetworkNotification[]>("/network-notifications");
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await api.post("/network-notifications/read-all", {});
    window.dispatchEvent(new Event("notifications-read"));
    load();
  }

  async function markRead(id: string) {
    await api.patch(`/network-notifications/${id}/read`, {});
    window.dispatchEvent(new Event("notifications-read"));
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  if (!role) return null;
  const homeHref = role === "office" ? "/office" : "/lawyer";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Bell className="w-5 h-5 text-orange-500" /> الإشعارات
        </h1>
        {items.some((i) => !i.isRead) && (
          <button onClick={markAllRead} className="text-sm text-orange-500 font-medium flex items-center gap-1 hover:underline">
            <CheckCheck className="w-4 h-4" /> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          لا توجد إشعارات بعد
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.isRead) markRead(n.id);
                if (n.link) navigate(n.link);
              }}
              className={`w-full text-right p-4 rounded-2xl border transition ${
                n.isRead ? "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800" : "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{n.title}</p>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />}
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{n.body}</p>
              <p className="text-gray-300 dark:text-gray-600 text-xs mt-2">{timeAgo(n.createdAt)}</p>
            </button>
          ))}
        </div>
      )}

      <Link href={homeHref} className="block text-center text-orange-500 text-sm mt-6 hover:underline">
        العودة للوحة التحكم
      </Link>
    </div>
  );
}
