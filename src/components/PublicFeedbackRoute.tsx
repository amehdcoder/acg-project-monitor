import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { feedbackProjectId } from "@/lib/publicFeedback";
import FeedbackForm from "@/pages/FeedbackForm";

class FeedbackBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">The feedback form could not open</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Please try again, or ask the programme team for a new feedback link.</p>
        <Button onClick={() => this.setState({ failed: false })}>Try again</Button>
      </main>
    );
  }
}

/** No auth, device session, GPS, workspace navigation or app overlays mount here. */
export default function PublicFeedbackRoute() {
  const location = useLocation();
  const projectId = feedbackProjectId(location);
  return <FeedbackBoundary key={`${location.pathname}${location.search}${location.hash}`}><FeedbackForm key={projectId} projectId={projectId} /></FeedbackBoundary>;
}