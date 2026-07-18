import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider, useI18n } from "./i18n/I18nProvider.jsx";
import { C } from "./theme.js";

// Safety net: if any render error occurs, show a small message instead of a
// blank screen, so the widget never fully disappears.
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("Widget error:", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div dir={this.props.dir} style={{ maxWidth: 420, margin: "40px auto", border: `1px solid ${C.border}`, borderRadius: 16, background: C.surface, boxShadow: `0 18px 48px ${C.shadow}`, padding: 24, color: C.text, fontFamily: "system-ui" }}>
          <h3 style={{ color: C.danger }}>{this.props.t("error.title")}</h3>
          <p dir="auto" style={{ color: C.muted, fontSize: 14 }}>{String(this.state.err?.message || this.state.err)}</p>
          <button onClick={() => this.setState({ err: null })}
            style={{ marginTop: 12, background: C.primary, color: C.onPrimary, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
            {this.props.t("error.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LocalizedBoundary({ children }) {
  const { t, dir } = useI18n();
  return <ErrorBoundary t={t} dir={dir}>{children}</ErrorBoundary>;
}

createRoot(document.getElementById("root")).render(
  <I18nProvider>
    <LocalizedBoundary><App /></LocalizedBoundary>
  </I18nProvider>
);
