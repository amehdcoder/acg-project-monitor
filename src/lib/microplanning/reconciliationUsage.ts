/** Allocation defaults are provisional; recorded actuals (including zero) always win. */
export function reconciliationUsage(allocated: number, actual: number | null | undefined, savedAllocation: boolean, fallback = 0): number {
  return actual != null ? Number(actual) : savedAllocation ? allocated : fallback;
}
export function validActualUsage(value: string): boolean {
  return value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}