import { describe, it, expect } from 'vitest';
import { settlementPinData, settlementPinContent } from '../settlementPins';
const entry = { settlement_name:'East', community_name:'Community', settlement_latitude:11.751, settlement_longitude:11.961, estimated_total_population:100, cdd_names:'Musa', extra_metadata:{ame_microplan:{kind:'settlement',measure_scope:'settlement'}} };
describe('settlement pins',()=>{
  it('uses settlement GPS and its own population/CDDs including confirmed zero',()=>{
    expect(settlementPinData(entry)).toMatchObject({lat:11.751,lng:11.961,population:100,cdd:'Musa',nested:true});
    expect(settlementPinData({...entry,estimated_total_population:0})?.population).toBe(0);
    expect(settlementPinData({...entry,cdd_details:[{name:'A'},{name:'B'}]})?.cdd).toBe('A, B');
  });
  it('never copies an inclusive community census or CDD assignment onto a legacy settlement',()=>{
    expect(settlementPinData({...entry,extra_metadata:null})).toMatchObject({population:null,cdd:'Not recorded for this settlement'});
  });
  it('rejects missing and invalid settlement GPS',()=>{
    expect(settlementPinData({...entry,settlement_latitude:null})).toBeNull();
    expect(settlementPinData({...entry,settlement_latitude:91})).toBeNull();
  });
  it('renders names safely as text instead of executable markup',()=>{
    const pin=settlementPinData({...entry,settlement_name:'<img src=x onerror=alert(1)>'});
    if (!pin) throw Error('Missing pin');
    const el=settlementPinContent(pin);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('11.75100, 11.96100');
  });
});