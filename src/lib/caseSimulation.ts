// Synthetic Case Management dataset for the owner "Simulate Data" mode.
// Mirrors the shape consumed by CasesView so KPIs, the case list and the
// Nigeria map all populate with realistic demo data — no backend writes.
import type { MapMarker } from "@/components/MapVisualization/types";

export interface SimulatedCase {
  id: string;
  name: string;
  caseTypeName: string;
  caseTypeLabel: string;
  caseTypeId: string;
  properties: Record<string, any>;
  status: "open" | "closed";
  openedAt: string;
  lastModifiedAt: string;
  closedAt?: string | null;
  ownerId: string;
  ownerName?: string;
  projectName?: string;
  projectId: string;
  activitiesCount?: number;
  followUpCount?: number;
  nextFollowUpDate?: string | null;
  followUpSchedule?: any;
  __simulated?: true;
}

// State capitals (and a couple of major cities) with real coordinates so the
// simulated points land in the correct place on the Nigeria boundary map.
const PLACES: { state: string; city: string; lat: number; lng: number }[] = [
  { state: "Kano", city: "Kano", lat: 12.0022, lng: 8.5919 },
  { state: "Lagos", city: "Lagos", lat: 6.5244, lng: 3.3792 },
  { state: "FCT", city: "Abuja", lat: 9.0579, lng: 7.4951 },
  { state: "Enugu", city: "Enugu", lat: 6.5244, lng: 7.5186 },
  { state: "Rivers", city: "Port Harcourt", lat: 4.8156, lng: 7.0498 },
  { state: "Borno", city: "Maiduguri", lat: 11.8333, lng: 13.1500 },
  { state: "Oyo", city: "Ibadan", lat: 7.3775, lng: 3.9470 },
  { state: "Kaduna", city: "Kaduna", lat: 10.5105, lng: 7.4165 },
  { state: "Sokoto", city: "Sokoto", lat: 13.0059, lng: 5.2476 },
  { state: "Cross River", city: "Calabar", lat: 4.9589, lng: 8.3269 },
  { state: "Plateau", city: "Jos", lat: 9.8965, lng: 8.8583 },
  { state: "Anambra", city: "Awka", lat: 6.2107, lng: 7.0747 },
  { state: "Delta", city: "Asaba", lat: 6.1980, lng: 6.7280 },
  { state: "Bauchi", city: "Bauchi", lat: 10.3158, lng: 9.8442 },
  { state: "Ondo", city: "Akure", lat: 7.2526, lng: 5.1931 },
  { state: "Niger", city: "Minna", lat: 9.6139, lng: 6.5569 },
];

const PROGRAMMES = [
  "Water Borehole Rehabilitation",
  "Primary Healthcare Upgrade",
  "School Infrastructure Renovation",
  "Livelihood Support Programme",
  "WASH Facility Construction",
  "Maternal Health Outreach",
  "Vector Control Campaign",
  "Nutrition Support Initiative",
];

const ASSIGNEES = [
  "Amina A.", "John O.", "Fatima S.", "Muhammad B.", "Chioma U.",
  "Ibrahim D.", "Grace N.", "Yusuf K.", "Blessing E.", "Samuel T.",
];

const ROLES = [
  "Field Officer", "Supervisor", "Field Officer", "Field Officer", "Supervisor",
  "Field Officer", "Supervisor", "Field Officer", "Field Officer", "Supervisor",
];

const STATUSES: ("open" | "closed")[] = ["open", "open", "open", "closed"];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export interface SimulatedDataset {
  cases: SimulatedCase[];
  markers: MapMarker[];
  kpis: {
    total: number;
    open: number;
    closed: number;
    followUpModules: number;
    overdue: number;
    activeFieldTeams: number;
    highPriority: number;
  };
  insights: {
    casesByState: { state: string; count: number }[];
    followUpTrends: { label: string; completed: number; pending: number; overdue: number }[];
    recentActivity: { type: "overdue" | "registered" | "completed"; title: string; meta: string }[];
  };
}

export function generateSimulatedCaseData(): SimulatedDataset {
  const cases: SimulatedCase[] = [];
  const markers: MapMarker[] = [];

  // Deterministic spread of ~64 cases across the places.
  const perPlace = 4;
  let idx = 0;
  for (const place of PLACES) {
    for (let i = 0; i < perPlace; i++) {
      idx++;
      const status = STATUSES[idx % STATUSES.length];
      const overdue = status === "open" && idx % 5 === 0;
      const priority = idx % 4 === 0 ? "high" : idx % 3 === 0 ? "medium" : "low";
      const code = `CASE-2025-${String(11000 + idx).padStart(5, "0")}`;
      const programme = PROGRAMMES[idx % PROGRAMMES.length];
      const assignee = ASSIGNEES[idx % ASSIGNEES.length];
      const role = ROLES[idx % ROLES.length];

      // jitter coordinates a little so points don't fully overlap
      const lat = place.lat + (((idx * 13) % 10) - 5) * 0.03;
      const lng = place.lng + (((idx * 7) % 10) - 5) * 0.03;

      const c: SimulatedCase = {
        id: `sim-${idx}`,
        name: `${code} · ${programme}`,
        caseTypeName: "field_case",
        caseTypeLabel: programme,
        caseTypeId: "sim-case-type",
        status,
        openedAt: daysAgo(60 - (idx % 50)),
        lastModifiedAt: daysAgo(idx % 20),
        closedAt: status === "closed" ? daysAgo(idx % 10) : null,
        ownerId: `sim-user-${idx % ASSIGNEES.length}`,
        ownerName: assignee,
        projectName: "National Field Programme",
        projectId: "sim-project",
        activitiesCount: 2 + (idx % 6),
        followUpCount: idx % 5,
        nextFollowUpDate: status === "open"
          ? (overdue ? daysAgo(idx % 7 + 1) : daysAhead((idx % 14) + 1))
          : null,
        followUpSchedule: null,
        properties: {
          state: place.state,
          lga: `${place.city} Municipal`,
          community: place.city,
          assignee,
          priority,
          gps: `${lat.toFixed(5)} ${lng.toFixed(5)} 0 12`,
        },
        __simulated: true,
      };
      cases.push(c);

      markers.push({
        id: `sim-marker-${idx}`,
        lat,
        lng,
        title: c.name,
        state: place.state,
        lga: c.properties.lga,
        community: place.city,
        markerColor: overdue ? "#ef4444" : status === "closed" ? "#94a3b8"
          : priority === "high" ? "#f59e0b" : "#10b981",
        submittedAt: c.lastModifiedAt,
        data: {
          _geoSource: "form_response",
          _accuracy: 12,
          caseName: c.name,
          caseType: programme,
          caseStatus: status,
          projectName: c.projectName,
        },
      });
    }
  }

  const open = cases.filter((c) => c.status === "open").length;
  const closed = cases.filter((c) => c.status === "closed").length;
  const overdue = cases.filter(
    (c) => c.status === "open" && c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date(),
  ).length;
  const highPriority = cases.filter((c) => c.properties.priority === "high").length;

  return {
    cases,
    markers,
    kpis: {
      total: cases.length,
      open,
      closed,
      followUpModules: 12,
      overdue,
      activeFieldTeams: ASSIGNEES.length,
      highPriority,
    },
  };
}
