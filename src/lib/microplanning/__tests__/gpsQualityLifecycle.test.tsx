import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GpsQualityCheck from '@/components/Microplanning/GpsQualityCheck';
import { analyseGpsQuality } from '../gpsQuality';
import { gpsQualitySignature } from '../gpsQualityCache';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), boundaries: vi.fn(), messages: vi.fn() }));
vi.mock('@/lib/programmeModule/offlineReadCache', () => ({ cacheGetForUser: mocks.get, cacheSetForUser: mocks.set }));
vi.mock('../nigeriaAdminBoundaries', () => ({ loadNigeriaAdminBoundaries: mocks.boundaries }));
const entry = { id: 'a', state: 'Kano', lga: 'Rano', community_latitude: 11.5, community_longitude: 8.5 };
const report = analyseGpsQuality([entry], []);
class TestWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  terminate() {}
  postMessage(data: { kind: string }) {
    mocks.messages(data);
    if (data.kind === 'analyse') this.onmessage?.({ data: { kind: 'report', report } });
  }
}
const view = (entries = [entry], userId = 'user-a', projectId = 'project-a') => <GpsQualityCheck entries={entries} userId={userId} projectId={projectId} projectName="Project" />;
describe('GPS audit calculation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Worker', TestWorker);
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue(undefined);
    mocks.boundaries.mockResolvedValue({ lgas: { features: [] } });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('calculates once, not on collapse/reopen or unchanged refresh; recalculates new GPS', async () => {
    const { rerender } = render(view());
    expect(mocks.messages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /GPS quality check/ }));
    await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /GPS quality check/ }));
    fireEvent.click(screen.getByRole('button', { name: /GPS quality check/ }));
    rerender(view([{ ...entry }]));
    await act(async () => {});
    expect(mocks.messages).toHaveBeenCalledTimes(1);
    rerender(view([{ ...entry, community_latitude: 12.5 }]));
    await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(2));
  });
  it('reopens from matching saved results without running boundary analysis', async () => {
    mocks.get.mockResolvedValue({ signature: gpsQualitySignature([entry]), report });
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /GPS quality check/ }));
    await screen.findByText('GPS points accepted');
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.boundaries).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledWith('user-a', 'gps-quality:project-a');
  });
  it('uses separate user/project caches and rejects changed authorized inputs', async () => {
    mocks.get.mockResolvedValue({ signature: gpsQualitySignature([]), report });
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: /GPS quality check/ }));
    await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(1));
    rerender(view([entry], 'user-b', 'project-b'));
    await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(2));
    expect(mocks.set).toHaveBeenLastCalledWith('user-b', 'gps-quality:project-b', { signature: gpsQualitySignature([entry]), report });
  });
});