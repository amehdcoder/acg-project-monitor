/** Activate an already downloaded release immediately; only fetch when absent. */
export async function activateAppWorker(registration: ServiceWorkerRegistration, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error('Update cancelled. Please retry.');
  if (!registration.waiting && !registration.installing) await registration.update();
  if (signal.aborted) throw new Error('Update cancelled. Please retry.');
  const worker = registration.waiting || registration.installing;
  if (!worker) return;
  const isActivated = () => worker.state === 'activated';
  if (isActivated()) return;
  const waitFor = (target: ServiceWorkerState, timeout: number, message: string) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(message)); }, timeout);
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', check); signal.removeEventListener('abort', cancel); };
    const check = () => {
      if (worker.state === target || worker.state === 'activated') { cleanup(); resolve(); }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error("The update download failed. Please retry.")); }
    };
    const cancel = () => { cleanup(); reject(new Error('Update cancelled. Please retry.')); };
    worker.addEventListener('statechange', check);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    check();
  });
  if (worker.state === 'installing') await waitFor('installed', 8000, 'The update is still downloading. Please retry.');
  if (signal.aborted) throw new Error('Update cancelled. Please retry.');
  if (isActivated()) return;
  const activated = waitFor('activated', 3000, 'The update activation timed out. Please retry.');
  worker.postMessage({ type: 'SKIP_WAITING' });
  await activated;
}