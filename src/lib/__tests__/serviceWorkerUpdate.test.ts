import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateAppWorker } from '../serviceWorkerUpdate';

function fakeWorker(state: ServiceWorkerState) {
  const worker = Object.assign(new EventTarget(), { state, postMessage: vi.fn() });
  return worker;
}
describe('release worker activation', () => {
  afterEach(() => vi.useRealTimers());
  it('activates a downloaded upgrade without a redundant network update request', async () => {
    const worker = fakeWorker('installed');
    worker.postMessage.mockImplementation(() => { worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')); });
    const update = vi.fn(() => new Promise(() => {}));
    await activateAppWorker({ waiting: worker, installing: null, update } as unknown as ServiceWorkerRegistration, new AbortController().signal);
    expect(update).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
  it('waits for an installing shell before activation', async () => {
    const worker = fakeWorker('installing');
    const update = vi.fn();
    const pending = activateAppWorker({ waiting: null, installing: worker, update } as unknown as ServiceWorkerRegistration, new AbortController().signal);
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.state = 'installed'; worker.dispatchEvent(new Event('statechange'));
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    worker.state = 'activated'; worker.dispatchEvent(new Event('statechange'));
    await pending;
    expect(update).not.toHaveBeenCalled();
  });
  it('checks the registration when no new worker has downloaded', async () => {
    const update = vi.fn(async () => {});
    await activateAppWorker({ waiting: null, installing: null, update } as unknown as ServiceWorkerRegistration, new AbortController().signal);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('cancels activation without allowing a stale completion', async () => {
    const worker = fakeWorker('installed');
    const controller = new AbortController();
    const pending = activateAppWorker({ waiting: worker } as unknown as ServiceWorkerRegistration, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    worker.state = 'activated'; worker.dispatchEvent(new Event('statechange'));
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });
  it('unlocks a timed-out activation for a retry', async () => {
    vi.useFakeTimers();
    const worker = fakeWorker('installed');
    const registration = { waiting: worker } as unknown as ServiceWorkerRegistration;
    const pending = activateAppWorker(registration, new AbortController().signal);
    const rejection = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(3001); await rejection;
    worker.postMessage.mockImplementation(() => { worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')); });
    await activateAppWorker(registration, new AbortController().signal);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
  });
});