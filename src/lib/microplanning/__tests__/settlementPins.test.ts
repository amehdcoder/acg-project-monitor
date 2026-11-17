import { describe, it, expect } from 'vitest';
import { settlementPinData, settlementPinContent, settlementLayerData } from '../settlementPins';
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
  it('includes every valid scoped settlement and reports missing GPS without inventing a pin',()=>{
    const layer=settlementLayerData([entry,{...entry,settlement_name:'West',settlement_latitude:11.752,estimated_total_population:150},{...entry,settlement_name:'Unlocated',settlement_latitude:null},{...entry,settlement_name:null}]);
    expect(layer.pins.map(({pin})=>[pin.name,pin.lat,pin.population])).toEqual([['East',11.751,100],['West',11.752,150]]);
    expect(layer.named).toBe(3);
    expect(layer.missingGps).toBe(1);
  });
  it('keeps settlement conditions, households, disability and every individual CDD together',()=>{
    const pin=settlementPinData({...entry,number_of_households:20,population_source:'cdd_census_census_update',terrain_type:'riverine',accessibility:'hard_to_reach',security_clearance:'partial',pwd_total:3,pwd_visual:0,pwd_physical:3,trachoma_1_9_male:5,trachoma_1_9_female:7,cdd_details:[{name:'Musa',phone:'08012345678',bank:'Bank A',account_number:'0012345678'},{name:'Amina',phone:'08098765432',bank:'Bank B',account_number:'0098765432'}]});
    expect(pin).toMatchObject({households:20,populationSource:'CDD Census/Census Update',terrain:'Riverine',accessibility:'Hard To Reach',security:'Partial'});
    expect(pin?.disability).toContainEqual(['Visual / Seeing',0]);
    expect(pin?.census).toContainEqual(['5–9 years · Male',5]);
    expect(pin?.census).toContainEqual(['5–9 years · Female',7]);
    expect(pin?.cdds.map(c=>[c.name,c.phone,c.accountNumber])).toEqual([['Musa','08012345678','0012345678'],['Amina','08098765432','0098765432']]);
  });
  it('does not invent settlement conditions, households or disability from inherited parent measures',()=>{
    const pin=settlementPinData({...entry,extra_metadata:null,number_of_households:20,terrain_type:'flat',pwd_total:3,cdd_details:[{name:'Parent CDD'}]});
    expect(pin).toMatchObject({households:null,terrain:null,disability:[],cdds:[]});
  });
});