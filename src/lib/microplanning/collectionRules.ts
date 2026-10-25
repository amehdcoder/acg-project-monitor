export function appliesGeoLock(rows: { project_id: string; user_id: string | null }[], userId: string | undefined, projectIds: Set<string>) {
 return rows.filter(r => !!userId && (r.user_id === userId || (r.user_id === null && projectIds.has(r.project_id))));
}
export function deviceEntryBelongsToProject(entry: { userId: string; projectId: string }, deviceId: string, projectId: string) {
 return entry.userId === `device:${deviceId}` && entry.projectId === projectId;
}
export function collectorNameValid(name: string) { return !!name.trim() && name.trim().length <= 120; }