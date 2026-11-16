import { describe, expect, it } from 'vitest';
import L from 'leaflet';
import { isBlankAreaClick } from '../areaMapInteraction';

describe('settlement clicks and blank-area inspection', () => {
  it('never treats a propagated settlement layer or missing event target as blank land', () => {
    const container=document.createElement('div');
    expect(isBlankAreaClick({layer:L.marker([12,11])} as unknown as L.LeafletMouseEvent,container)).toBe(false);
    expect(isBlankAreaClick({} as L.LeafletMouseEvent,container)).toBe(false);
    const marker=document.createElement('div');marker.className='leaflet-marker-icon';
    expect(isBlankAreaClick({originalEvent:{target:marker}} as unknown as L.LeafletMouseEvent,container)).toBe(false);
    expect(isBlankAreaClick({originalEvent:{target:container}} as unknown as L.LeafletMouseEvent,container)).toBe(true);
  });
});