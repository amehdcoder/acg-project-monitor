import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormAnalytics, LocationAnalytics } from "@/hooks/useDataAnalytics";

interface SubmissionChartsProps {
  formAnalytics: FormAnalytics[];
  locationAnalytics: LocationAnalytics[];
  loading?: boolean;
}

const SubmissionCharts = ({ formAnalytics, locationAnalytics, loading }: SubmissionChartsProps) => {
  const maxFormSubmissions = Math.max(...formAnalytics.map((f) => f.total_submissions), 1);
  const maxLocationSubmissions = Math.max(...locationAnalytics.map((l) => l.total_submissions), 1);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="border-0 shadow-card animate-pulse">
            <CardHeader>
              <div className="h-6 w-40 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-2 bg-muted rounded-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Submissions by Form */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Submissions by Form</CardTitle>
        </CardHeader>
        <CardContent>
          {formAnalytics.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No form data available</p>
          ) : (
            <div className="space-y-4">
              {formAnalytics.slice(0, 5).map((form) => {
                const totalPercent = (form.total_submissions / maxFormSubmissions) * 100;
                const currentPercent =
                  form.total_submissions > 0
                    ? (form.current_cycle_submissions / form.total_submissions) * totalPercent
                    : 0;

                return (
                  <div key={form.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground truncate max-w-[200px]" title={form.name}>
                        {form.name}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-2">
                        {form.total_submissions.toLocaleString()}
                        {form.current_cycle_submissions > 0 && (
                          <span className="text-green-600 text-xs">
                            (+{form.current_cycle_submissions})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      {/* Total submissions bar (background) */}
                      <div
                        className="h-full rounded-full bg-primary/30 relative"
                        style={{ width: `${totalPercent}%` }}
                      >
                        {/* Current cycle bar (foreground) */}
                        <div
                          className="absolute top-0 left-0 h-full rounded-full bg-primary transition-all duration-500"
                          style={{
                            width: `${(form.current_cycle_submissions / form.total_submissions) * 100 || 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions by Location */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Submissions by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {locationAnalytics.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No location data available</p>
          ) : (
            <div className="space-y-4">
              {locationAnalytics.slice(0, 5).map((location) => {
                const totalPercent = (location.total_submissions / maxLocationSubmissions) * 100;

                return (
                  <div key={location.state} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">{location.state} State</span>
                      <span className="text-muted-foreground flex items-center gap-2">
                        {location.total_submissions.toLocaleString()}
                        {location.current_cycle_submissions > 0 && (
                          <span className="text-green-600 text-xs">
                            (+{location.current_cycle_submissions})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-acg-gold/30 relative"
                        style={{ width: `${totalPercent}%` }}
                      >
                        <div
                          className="absolute top-0 left-0 h-full rounded-full bg-acg-gold transition-all duration-500"
                          style={{
                            width: `${
                              (location.current_cycle_submissions / location.total_submissions) * 100 || 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubmissionCharts;
