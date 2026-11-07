/** Yield between small imperative drawing batches; cleanup cancels stale map work. */
export function renderBatches<T>(items: T[], draw: (item: T) => void, complete?: () => void) {
  let index = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const step = () => {
    const started = performance.now();
    let count = 0;
    while (!cancelled && index < items.length && count < 5 && performance.now() - started < 8) {
      draw(items[index]);
      index++;
      count++;
    }
    if (cancelled) return;
    if (index < items.length) timer = setTimeout(step, 0);
    else complete?.();
  };
  timer = setTimeout(step, 0);
  return () => { cancelled = true; clearTimeout(timer); };
}