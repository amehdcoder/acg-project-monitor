import {
  FileText,
  Send,
  Clock,
  CheckCircle,
  TrendingUp,
  Users,
  MapPin,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const stats = [
  {
    label: "Total Forms",
    value: "24",
    icon: FileText,
    change: "+3 this week",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    label: "Submissions",
    value: "1,234",
    icon: Send,
    change: "+156 today",
    color: "text-acg-gold",
    bgColor: "bg-acg-gold/10",
  },
  {
    label: "Pending Sync",
    value: "12",
    icon: Clock,
    change: "Awaiting connection",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    label: "Completed",
    value: "98%",
    icon: CheckCircle,
    change: "Completion rate",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
];

const recentForms = [
  {
    name: "Health Facility Assessment",
    submissions: 45,
    lastUpdated: "2 hours ago",
    status: "active",
  },
  {
    name: "Community Outreach Survey",
    submissions: 128,
    lastUpdated: "5 hours ago",
    status: "active",
  },
  {
    name: "Vaccination Campaign Tracker",
    submissions: 89,
    lastUpdated: "1 day ago",
    status: "active",
  },
  {
    name: "Water Quality Monitoring",
    submissions: 23,
    lastUpdated: "2 days ago",
    status: "draft",
  },
];

const Dashboard = () => {
  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-6 text-primary-foreground lg:p-8">
        <div className="bg-pattern-geometric absolute inset-0 opacity-30" />
        <div className="relative z-10">
          <h1 className="font-display text-2xl font-bold lg:text-3xl">
            Welcome back, John!
          </h1>
          <p className="mt-2 text-primary-foreground/80">
            Monitor your field activities and track project progress
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="gold" size="lg">
              <FileText className="h-5 w-5" />
              Fill New Form
            </Button>
            <Button variant="gold-outline" size="lg">
              <Send className="h-5 w-5" />
              Sync Data
            </Button>
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-acg-gold/20 blur-3xl" />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-0 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.change}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Forms */}
        <Card className="border-0 shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-xl">Recent Forms</CardTitle>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentForms.map((form) => (
              <div
                key={form.name}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{form.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {form.submissions} submissions • {form.lastUpdated}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      form.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {form.status}
                  </span>
                  <Button variant="ghost" size="sm">
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Field Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-acg-gold/10 p-2">
                  <Users className="h-5 w-5 text-acg-gold" />
                </div>
                <div>
                  <p className="font-medium text-foreground">12 Enumerators</p>
                  <p className="text-xs text-muted-foreground">Active today</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">8 Locations</p>
                  <p className="text-xs text-muted-foreground">Being covered</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="font-medium text-foreground">+23%</p>
                  <p className="text-xs text-muted-foreground">vs last week</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Upcoming Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <Calendar className="h-5 w-5 text-acg-gold" />
                <div>
                  <p className="text-sm font-medium">Weekly Review</p>
                  <p className="text-xs text-muted-foreground">Tomorrow, 9 AM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Field Visit - Zone A</p>
                  <p className="text-xs text-muted-foreground">Jan 3, 8 AM</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
