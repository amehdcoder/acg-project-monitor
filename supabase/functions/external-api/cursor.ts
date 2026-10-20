export function parseCursor(raw: string): { timestamp: string; id: string } | null {
  const parts = raw.split("|");
  if (parts.length !== 2) return null;
  const [timestamp, id] = parts;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { timestamp, id };
}