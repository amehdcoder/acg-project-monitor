export function retryEvent(delivery: { event_id: string | null; event: string }, original: { payload: unknown } | null, projectId: string) {
  if (delivery.event_id && !original) return null;
  return { id: delivery.event_id, event: delivery.event, project_id: projectId,
    payload: original?.payload ?? { message: "Amehnities test webhook" } };
}