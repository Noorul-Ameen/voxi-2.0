"use client";

import React from "react";
import App from "../src/App.jsx";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider.jsx";
import { C } from "../src/theme.js";

class ErrorBoundary extends React.Component<any, { err: Error | null }> {
  state = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) { console.error("Widget error:", err, info); }
  render() {
    if (this.state.err) return (
      <div dir={this.props.dir} style={{ maxWidth: 420, margin: "40px auto", border: `1px solid ${C.border}`, borderRadius: 16, background: C.surface, padding: 24, color: C.text }}>
        <h3 style={{ color: C.danger }}>{this.props.t("error.title")}</h3>
        <p dir="auto" style={{ color: C.muted, fontSize: 14 }}>{String(this.state.err.message || this.state.err)}</p>
        <button onClick={() => this.setState({ err: null })} style={{ marginTop: 12, background: C.primary, color: C.onPrimary, border: 0, borderRadius: 8, padding: "8px 16px" }}>{this.props.t("error.retry")}</button>
      </div>
    );
    return this.props.children;
  }
}

function LocalizedApp() {
  const { t, dir } = useI18n();
  return <ErrorBoundary t={t} dir={dir}><App /></ErrorBoundary>;
}

export default function Page() {
  return <I18nProvider><LocalizedApp /></I18nProvider>;
}
