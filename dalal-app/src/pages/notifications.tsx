import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell, MessageCircle, Tag, Pin, CheckCheck } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function iconFor(type: string) {
  switch (type) {
    case "message": return MessageCircle;
    case "deal_type": return Tag;
    case "pinned": return Pin;
    default: return Bell;
  }
}

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getUser()) { navigate("/login"); return; }
    api.get<Notification[]>("/notifications")
      .then((d) => {
        setItems(d);
        if (d.some((n) => !n.read)) {
          api.post("/notifications/read-all", {})
            .then(() => window.dispatchEvent(new Event("notifications-read")))
            .catch(() => {});
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5">
        <Bell className="w-6 h-6 text-orange-500" />
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">الإشعارات</h1>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bell className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p>لا توجد إشعارات بعد</p>
          <p className="text-sm mt-1 text-gray-300 dark:text-gray-600">ستصلك هنا كل المستجدات المهمة</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <button
                key={n.id}
                onClick={() => { if (n.link) navigate(n.link); }}
                className={`w-full text-right rounded-2xl p-4 shadow-sm border transition flex gap-3 ${
                  n.read
                    ? "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800"
                    : "bg-orange-50/60 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900"
                } ${n.link ? "hover:border-orange-200 dark:hover:border-orange-800 cursor-pointer" : "cursor-default"}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  n.read
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                    : "bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800 dark:text-gray-100 text-sm flex-1">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />}
                  </div>
                  {n.body && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 leading-relaxed">{n.body}</p>}
                  <p className="text-gray-300 dark:text-gray-600 text-[11px] mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            );
          })}
          <div className="flex items-center justify-center gap-1.5 text-gray-300 dark:text-gray-600 text-xs pt-4">
            <CheckCheck className="w-4 h-4" />
            تم عرض كل الإشعارات
          </div>
        </div>
      )}
    </div>
  );
}
