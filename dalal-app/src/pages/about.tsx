import { useLocation } from "wouter";
import { ShieldCheck, Search, MessageCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function AboutPage() {
  const [, navigate] = useLocation();
  const t = useT();

  const steps = [
    { icon: Search, title: t("about.step1Title"), body: t("about.step1Body") },
    { icon: MessageCircle, title: t("about.step2Title"), body: t("about.step2Body") },
    { icon: CheckCircle2, title: t("about.step3Title"), body: t("about.step3Body") },
  ];
  const why = [t("about.why1"), t("about.why2"), t("about.why3")];
  const faqs = [
    { q: t("about.q1"), a: t("about.a1") },
    { q: t("about.q2"), a: t("about.a2") },
    { q: t("about.q3"), a: t("about.a3") },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-3xl p-8 text-center mb-8">
        <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-90" />
        <h1 className="text-2xl font-bold mb-3">{t("about.title")}</h1>
        <p className="text-orange-50 text-sm leading-relaxed">{t("about.intro")}</p>
      </section>

      {/* How it works */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5">{t("about.howTitle")}</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="w-11 h-11 bg-orange-100 dark:bg-orange-950 rounded-xl flex items-center justify-center text-orange-500 mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-1">{title}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-orange-500" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t("about.whyTitle")}</h2>
        </div>
        <ul className="space-y-3">
          {why.map((w, i) => (
            <li key={i} className="flex items-start gap-3 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-gray-200">{w}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">{t("about.faqTitle")}</h2>
        <div className="space-y-3">
          {faqs.map(({ q, a }, i) => (
            <details key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 group">
              <summary className="font-bold text-gray-800 dark:text-gray-100 text-sm cursor-pointer list-none flex items-center justify-between">
                {q}
                <span className="text-orange-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
              </summary>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-gray-900 text-white rounded-3xl p-8 text-center">
        <h2 className="text-xl font-bold mb-2">{t("about.contactTitle")}</h2>
        <p className="text-gray-400 text-sm mb-5">{t("about.contactBody")}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="https://wa.me/9647740080310"
            target="_blank"
            rel="noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold transition"
          >
            {t("about.contactBtn")}
          </a>
          <button
            onClick={() => navigate("/add-listing")}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold transition"
          >
            {t("home.ctaButton")}
          </button>
        </div>
      </section>
    </div>
  );
}
