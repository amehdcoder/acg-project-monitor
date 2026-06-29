import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  /** Friendly name of the section, shown in the fallback. */
  label: string;
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Lightweight per-section error boundary. Keeps one failing analysis panel
 * (map, checklist analysis, signature gallery, stats) from taking down the
 * whole dashboard, and offers an in-place recovery action.
 */
export default class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: error?.message || "Something went wrong rendering this section." };
  }

  componentDidCatch(error: any) {
    console.warn(`[${this.props.label}] section error`, error);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center" data-pdf-exclude="true">
            <AlertCircle className="h-7 w-7 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">{this.props.label} couldn’t be displayed</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{this.state.message}</p>
            </div>
            <Button size="sm" variant="outline" onClick={this.reset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
