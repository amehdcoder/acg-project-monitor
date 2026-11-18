import { describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import { attachSettlementDetails } from '../settlementMapDetails';
import { settlementPinData } from '../settlementPins';

describe('settlement detail selection', () => {
  it('retains the full selected record when a clustered marker is temporarily removed', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const container = document.createElement('div');
    document.body.append(container);
    const map = L.map(container).setView([12.874, 11.019], 18);
    const marker = L.marker([12.874, 11.019]).addTo(map);
    const pin = settlementPinData({ settlement_name: 'Angwar Hardo', community_name: 'Lawan Fanami', settlement_latitude: 12.874, settlement_longitude: 11.019, estimated_total_population: 20, cdd_names: 'T', extra_metadata: { ame_microplan: { measure_scope: 'settlement' } } });
    if (!pin) throw new Error('Expected valid settlement');
    const detach = attachSettlementDetails(map, marker, pin);
    marker.fire('click');
    const popup = Object.values((map as unknown as { _layers: Record<number, L.Layer> })._layers).find(layer => layer instanceof L.Popup);
    expect(popup).toBeInstanceOf(L.Popup);
    if (!(popup instanceof L.Popup)) throw new Error('Expected full detail popup');
    map.removeLayer(marker);
    expect(popup.isOpen()).toBe(true);
    expect(marker.getTooltip()).toBeUndefined();
    detach();
    expect(popup.isOpen()).toBe(false);
    map.remove(); container.remove(); vi.unstubAllGlobals();
  });
});