import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Phone, Lock, User, Eye, EyeOff } from "lucide-react";
import { api, setToken, saveUser } from "@/lib/api";
import { LOGO_URL } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function RegisterPage() {
  const t = useT();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ token: string; id: string; phone: string; name: string; role: string }>(
        "/auth/register",
        { name, phone, password }
      );
      setToken(data.token);
      saveUser({ userId: data.id, phone: data.phone, name: data.name, role: data.role });
      window.dispatchEvent(new Event("auth-change"));
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt={t("brand.name")} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-lg shadow-orange-200" />
          <h1 className="text-2xl font-bold text-gray-800">إنشاء حساب جديد</h1>
          <p className="text-gray-400 text-sm mt-1">انضم إلى شبكة دلال العراق</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3 mb-4 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("auth.name")}</label>
              <div className="relative">
                <User className="absolute right-3 top-3 w-5 h-5 text-gray-300" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="أحمد محمد" required
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("auth.phone")}</label>
              <div className="relative">
                <Phone className="absolute right-3 top-3 w-5 h-5 text-gray-300" />
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXXX" required
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("auth.password")}</label>
              <div className="relative">
                <Lock className="absolute right-3 top-3 w-5 h-5 text-gray-300" />
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل" required minLength={6}
                  className="w-full pr-10 pl-10 py-3 border border-gray-200 rounded-xl text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-3 text-gray-300 hover:text-gray-500">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
              {loading ? "جاري الإنشاء..." : t("auth.registerBtn")}
            </button>
          </form>

          <p className="text-center text-gray-400 text-sm mt-5">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="text-orange-500 font-medium hover:underline">{t("auth.login")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
