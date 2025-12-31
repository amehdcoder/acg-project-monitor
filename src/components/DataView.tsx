import {
  BarChart3,
  Download,
  Filter,
  RefreshCw,
  Table,
  LineChart,
  PieChart,
  Map,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const DataView = () => {
  const handleExport = (format: string) => {
    toast({
      title: `Exporting as ${format}`,
      description: "Your data export will be ready shortly.",
    });
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Data & Analytics
          </h1>
          <p className="text-muted-foreground">
            View and analyze your collected data
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="acg" onClick={() => handleExport("CSV")}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Chart Type Selector */}
      <div className="flex flex-wrap gap-3">
        {[
          { icon: Table, label: "Table View", active: true },
          { icon: BarChart3, label: "Bar Chart" },
          { icon: LineChart, label: "Line Chart" },
          { icon: PieChart, label: "Pie Chart" },
          { icon: Map, label: "Map View" },
        ].map((item) => (
          <Button
            key={item.label}
            variant={item.active ? "acg" : "outline"}
            size="sm"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Submissions", value: "3,456", change: "+12%" },
          { label: "This Week", value: "234", change: "+8%" },
          { label: "Unique Locations", value: "48", change: "+3" },
          { label: "Avg. Completion", value: "94%", change: "+2%" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-soft">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-foreground">
                  {stat.value}
                </span>
                <span className="text-sm text-green-500">{stat.change}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Recent Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                    Form
                  </th>
                  <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                    Submitted By
                  </th>
                  <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                    Location
                  </th>
                  <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  {
                    form: "Health Facility Assessment",
                    submitter: "John Doe",
                    location: "Lagos - Zone A",
                    date: "Dec 30, 2024",
                    status: "synced",
                  },
                  {
                    form: "Community Survey",
                    submitter: "Jane Smith",
                    location: "Abuja - District 3",
                    date: "Dec 30, 2024",
                    status: "synced",
                  },
                  {
                    form: "Vaccination Tracker",
                    submitter: "Mike Johnson",
                    location: "Kano - Ward 5",
                    date: "Dec 29, 2024",
                    status: "pending",
                  },
                  {
                    form: "Water Quality Check",
                    submitter: "Sarah Williams",
                    location: "Rivers - Site 12",
                    date: "Dec 29, 2024",
                    status: "synced",
                  },
                  {
                    form: "Maternal Health Survey",
                    submitter: "David Brown",
                    location: "Lagos - Zone B",
                    date: "Dec 28, 2024",
                    status: "synced",
                  },
                ].map((row, index) => (
                  <tr key={index} className="hover:bg-muted/50">
                    <td className="py-4 text-sm font-medium text-foreground">
                      {row.form}
                    </td>
                    <td className="py-4 text-sm text-muted-foreground">
                      {row.submitter}
                    </td>
                    <td className="py-4 text-sm text-muted-foreground">
                      {row.location}
                    </td>
                    <td className="py-4 text-sm text-muted-foreground">
                      {row.date}
                    </td>
                    <td className="py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          row.status === "synced"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Showing 5 of 3,456 entries
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Submissions by Form</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Health Facility Assessment", count: 1234, percent: 36 },
                { name: "Community Survey", count: 890, percent: 26 },
                { name: "Vaccination Tracker", count: 678, percent: 20 },
                { name: "Water Quality Check", count: 456, percent: 13 },
                { name: "Other Forms", count: 198, percent: 5 },
              ].map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{item.name}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Submissions by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Lagos State", count: 1456, percent: 42 },
                { name: "Abuja FCT", count: 789, percent: 23 },
                { name: "Kano State", count: 567, percent: 16 },
                { name: "Rivers State", count: 432, percent: 12 },
                { name: "Other Locations", count: 212, percent: 7 },
              ].map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{item.name}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-acg-gold transition-all duration-500"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataView;
