import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'Component'}:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-rose-50/30 rounded-2xl border border-rose-100 min-h-[200px]">
          <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Widget Interface Error</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
              {this.props.name || "This component"} failed to render telemetry.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={this.handleReset}
            className="h-8 border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl font-bold text-[10px] uppercase tracking-widest"
          >
            <RefreshCw className="h-3 w-3 mr-2" /> Attempt Recovery
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
