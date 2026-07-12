import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordError } from "@/lib/errorReporter";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
  eventId: string | null;
}

/**
 * Route-level recovery boundary.
 *
 * Sits INSIDE the router (below the providers) so a runtime exception thrown
 * while a dashboard, form, or page renders is caught here instead of blanking
 * the entire viewport. The providers, router and offline engine stay mounted,
 * and the user gets a friendly "Reload Component" recovery state — pressing it
 * resets the subtree and re-renders the current route without a full reload.
 *
 * The top-level RootErrorBoundary remains as the last-resort safety net for any
 * error thrown above the router.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null, eventId: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Unexpected render error",
      eventId: `route-${Date.now().toString(36)}`,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      recordError("boundary", error, {
        message:
          (error?.message || "route render error") +
          (info.componentStack ? `\n${info.componentStack}` : ""),
      });
    } catch {
      /* logging must never cause a secondary crash */
    }
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    // Reset the subtree so the current route re-mounts cleanly.
    this.setState({ hasError: false, message: null, eventId: null });
  };

  private handleHome = () => {
    this.setState({ hasError: false, message: null, eventId: null });
    if (window.location.pathname !== "/") window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-12 text-center">
        <div className="w-full max-w-md space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold text-foreground">
              This section hit a snag
            </h1>
            <p className="text-sm text-muted-foreground">
              We caught an error before it could blank your screen. Your session
              and unsaved offline data are safe — reload this section to continue.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={this.handleReload} className="rounded-xl font-semibold">
              <RefreshCw className="mr-2 h-4 w-4" /> Reload Component
            </Button>
            <Button
              variant="outline"
              onClick={this.handleHome}
              className="rounded-xl font-semibold"
            >
              <Home className="mr-2 h-4 w-4" /> Go to Home
            </Button>
          </div>
          {this.state.eventId && (
            <p className="font-mono text-[10px] text-muted-foreground/70">
              Error ID: {this.state.eventId}
            </p>
          )}
        </div>
      </div>
    );
  }
}
