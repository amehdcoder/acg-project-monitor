/**
 * Dev-only test harness for MdaAdvancedAnalyses.
 *
 * Mounts the analyses dashboard with deterministic, in-memory mock data so the
 * cross-filter behaviour (Supervisor bar/chip ↔ Community Visit Timeline) can be
 * exercised by Playwright end-to-end tests WITHOUT a backend, auth, or live data.
 *
 * Only reachable when running the Vite dev server (import.meta.env.DEV). In a
 * production build this route renders NotFound, so it is never shipped to users.
 */
import { useMemo } from "react";
import NotFound from "./NotFound";
import MdaAdvancedAnalyses from "@/components/MdaChecklist/MdaAdvancedAnalyses";
import type { ASubmission, AQuestion } from "@/lib/mda/analyses";

// Deterministic dataset: 3 supervisors, fixed community counts.
//   Aisha Bello   → 3 communities
//   Musa Ibrahim  → 2 communities
//   Grace Okeke   → 1 community
const SUPERVISORS: Array<{ name: string; communities: number }> = [
  { name: "Aisha Bello", communities: 3 },
  { name: "Musa Ibrahim", communities: 2 },
  { name: "Grace Okeke", communities: 1 },
];

function buildSubmissions(): ASubmission[] {
  const out: ASubmission[] = [];
  let day = 1;
  for (const sup of SUPERVISORS) {
    for (let i = 0; i < sup.communities; i++) {
      const community = `${sup.name.split(" ")[0]} Community ${i + 1}`;
      out.push({
        id: `${sup.name}-${i}`,
        state: "Jigawa",
        lga: "Dutse",
        ward: "Ward A",
        submitter: sup.name,
        submittedAt: `2026-06-${String(day).padStart(2, "0")}T09:00:00.000Z`,
        status: "finalized",
        data: {
          state: "Jigawa",
          lga: "Dutse",
          ward: "Ward A",
          community_name: community,
          supervisor_name: sup.name,
        },
      });
      day++;
    }
  }
  return out;
}

const QUESTIONS: AQuestion[] = [
  { id: "community_name", name: "community_name", label: "Community name", type: "text" },
  { id: "supervisor_name", name: "supervisor_name", label: "Supervisor name", type: "text" },
];

export default function MdaAnalysesHarness() {
  if (!import.meta.env.DEV) return <NotFound />;
  const submissions = useMemo(buildSubmissions, []);
  return (
    <div className="min-h-screen bg-background p-4" data-testid="mda-harness-root">
      <MdaAdvancedAnalyses
        submissions={submissions}
        questions={QUESTIONS}
        projectName="Harness Project"
      />
    </div>
  );
}
