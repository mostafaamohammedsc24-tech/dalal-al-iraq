import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dict, type Lang, type DictKey } from "./dictionary";

export type { Lang };

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "ar", label: "العربية", flag: "🇮🇶" },
  { code: "ku", label: "کوردی", flag: "☀️" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

const RTL_LANGS: Lang[] = ["ar", "ku"];
export function isRtl(lang: Lang): boolean {
  return RTL_LANGS.includes(lang);
}

const I18nContext = createContext<{
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}>({
  lang: "ar",
  dir: "rtl",
  setLang: () => {},
  t: (k) => k,
});

function readLang(): Lang {
  try {
    const v = localStorage.getItem("lang");
    if (v === "ar" || v === "ku" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "ar";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const dir = isRtl(lang) ? "rtl" : "ltr";

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
    try {
      localStorage.setItem("lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  function t(key: DictKey, vars?: Record<string, string | number>): string {
    const table = dict[lang] as Record<string, string>;
    const fallback = dict.ar as Record<string, string>;
    let s = table[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  }

  return (
    <I18nContext.Provider value={{ lang, dir, setLang: setLangState, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
