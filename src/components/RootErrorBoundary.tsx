import { Component, ErrorInfo, ReactNode } from "react";

interface State { hasError: boolean; error: Error | null; }

/**
 * Top-level safety net. Guarantees the app NEVER displays a blank white screen:
 * any uncaught render error shows a recoverable fallback with a "Refresh to latest" button.
 */
export default class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught error:", error, info);
  }

  private handleReload = async () => {
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set("__app_update", String(Date.now()));
    window.location.replace(url.toString());
  };

  private handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "hsl(0 0% 100%)", color: "hsl(222 47% 11%)", padding: 24, fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "hsl(215 16% 47%)", margin: "0 0 20px" }}>
            The app caught a render error and prevented a blank screen. Try recovering or refresh to the latest version.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={this.handleReset} style={{
              padding: "10px 18px", borderRadius: 8, border: "1px solid hsl(215 16% 80%)",
              background: "white", cursor: "pointer", fontWeight: 600,
            }}>Try again</button>
            <button onClick={this.handleReload} style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "hsl(221 83% 53%)", color: "white", cursor: "pointer", fontWeight: 600,
            }}>Refresh to latest</button>
          </div>
          {this.state.error?.message && (
            <pre style={{
              marginTop: 16, fontSize: 11, textAlign: "left", background: "hsl(210 40% 96%)",
              padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 160,
            }}>{this.state.error.message}</pre>
          )}
        </div>
      </div>
    );
  }
}
