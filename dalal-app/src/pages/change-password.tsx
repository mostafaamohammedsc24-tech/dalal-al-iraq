import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Lock, KeyRound } from "lucide-react";
import { api, getUser, saveUser } from "@/lib/api";
import { LOGO_URL } from "@/lib/utils";

// شاشة إجبارية لتغيير كلمة المرور عند أول دخول لحسابات المكاتب/المحامين.
export default function ChangePasswordPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<{ role?: string; userId?: string; name?: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "office" && u.role !== "lawyer")) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const endpoint = user?.role === "office" ? "/office/auth/change-password" : "/lawyer/auth/change-password";
      await api.post(endpoint, { newPassword: password });
      saveUser({ ...user });
      navigate(user?.role === "office" ? "/office" : "/lawyer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="دلال العراق" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-lg shadow-orange-200" />
          <h1 className="text-2xl font-bold text-gray-800">تعيين كلمة مرور جديدة</h1>
          <p className="text-gray-400 text-sm mt-1">مرحباً {user.name}، لأمان حسابك يرجى تعيين كلمة مرور خاصة بك</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3 mb-4 text-sm text-center">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور الجديدة</label>
              <div className="relative">
                <Lock className="absolute right-3 top-3 w-5 h-5 text-gray-300" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل" required
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تأكيد كلمة المرور</label>
              <div className="relative">
                <KeyRound className="absolute right-3 top-3 w-5 h-5 text-gray-300" />
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور" required
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm mt-2">
              {loading ? "جاري الحفظ..." : "حفظ ومتابعة"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
