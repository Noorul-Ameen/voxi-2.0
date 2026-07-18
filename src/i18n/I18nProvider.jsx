import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STRINGS } from "./strings.js";

const STORAGE_KEY = "vox_locale";
const I18nContext = createContext(null);

function initialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
  } catch {}
  return "en";
}

function interpolate(value, vars) {
  return Object.entries(vars || {}).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement ?? "")),
    value,
  );
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const setLocale = (next) => {
    const safe = next === "ar" ? "ar" : "en";
    setLocaleState(safe);
    try { localStorage.setItem(STORAGE_KEY, safe); } catch {}
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.title = STRINGS[locale]["app.documentTitle"];
  }, [locale, dir]);

  const value = useMemo(() => {
    const t = (key, vars) => interpolate(STRINGS[locale]?.[key] || STRINGS.en[key] || key, vars);
    const formatCurrency = (amount, currency = "AED") => new Intl.NumberFormat(
      locale === "ar" ? "ar-AE" : "en-AE",
      { style: "currency", currency, maximumFractionDigits: 2 },
    ).format(Number(amount) || 0);
    const formatDate = (value) => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return value || "";
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
        dateStyle: "medium",
      }).format(date);
    };
    return {
      locale,
      dir,
      t,
      formatCurrency,
      formatDate,
      setLocale,
      toggleLocale: () => setLocale(locale === "en" ? "ar" : "en"),
    };
  }, [locale, dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
