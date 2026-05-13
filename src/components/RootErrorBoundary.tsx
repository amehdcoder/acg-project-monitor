import { Component, ErrorInfo, ReactNode } from "react";
import { recordError, copyReport, downloadReport, refreshToLatest, type ErrorReport } from "@/lib/errorReporter";

interface State { hasError: boolean; report: ErrorReport | null; copied: boolean; }

/**
 * Top-level safety net. Guarantees the app NEVER displays a blank white screen:
 * any uncaught render error shows a recoverable fallback with diagnostic capture
 * (copy / download) and a reliable "Refresh to latest" recovery path.
 */
export default class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, report: null, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const report = recordError("boundary", error, { message: error.message + (info.componentStack ? `\n${info.componentStack}` : "") });
    this.setState({ report });
  }

  private handleReload = () => { refreshToLatest().catch(() => window.location.reload()); };
  private handleReset = () => this.setState({ hasError: false, report: null, copied: false });
  private handleCopy = async () => {
    if (!this.state.report) return;
    const ok = await copyReport(this.state.report);
    this.setState({ copied: ok });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };
  private handleDownload = () => { if (this.state.report) downloadReport(this.state.report); };

  render() {
    if (!this.state.hasError) return this.props.children;
    const r = this.state.report;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "hsl(0 0% 100%)", color: "hsl(222 47% 11%)", padding: 24, fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "hsl(215 16% 47%)", margin: "0 0 16px" }}>
            The app caught a render error and prevented a blank screen. Capture the diagnostic
            details for your supervisor, then recover or refresh to the latest version.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={this.handleReset} style={btnSecondary}>Try again</button>
            <button onClick={this.handleReload} style={btnPrimary}>Refresh to latest</button>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={this.handleCopy} style={btnGhost}>{this.state.copied ? "✓ Copied" : "Copy diagnostics"}</button>
            <button onClick={this.handleDownload} style={btnGhost}>Download report</button>
          </div>
          {r && (
            <details style={{ marginTop: 16, textAlign: "left" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "hsl(215 16% 47%)" }}>
                Show diagnostics ({r.id})
              </summary>
              <pre style={{
                marginTop: 8, fontSize: 11, background: "hsl(210 40% 96%)",
                padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap",
              }}>{r.message}{r.stack ? `\n\n${r.stack}` : ""}</pre>
              <div style={{ fontSize: 11, color: "hsl(215 16% 47%)", marginTop: 6 }}>
                Build {r.buildId} · {r.online ? "online" : "offline"} · {r.viewport} · {new Date(r.ts).toLocaleString()}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }
}

const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", background: "hsl(221 83% 53%)", color: "white", cursor: "pointer", fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "1px solid hsl(215 16% 80%)", background: "white", cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid hsl(215 16% 88%)", background: "hsl(210 40% 98%)", cursor: "pointer", fontWeight: 500, fontSize: 13 };
