import { describe, expect, it } from 'vitest';
import { appliesGeoLock, deviceEntryBelongsToProject, collectorNameValid } from './collectionRules';
describe('Geo collection rules', () => {
 it('whole-project lock applies to every assigned member including administrators', () => { expect(appliesGeoLock([{project_id:'p',user_id:null}], 'admin', new Set(['p']))).toHaveLength(1); });
 it('unrelated project does not lock a member', () => { expect(appliesGeoLock([{project_id:'p',user_id:null}], 'user', new Set(['other']))).toHaveLength(0); });
 it('individual lock applies to its named member', () => { expect(appliesGeoLock([{project_id:'p',user_id:'admin'}], 'admin', new Set())).toHaveLength(1); });
 it('device queue cannot cross project boundaries', () => { expect(deviceEntryBelongsToProject({userId:'device:d',projectId:'a'}, 'd', 'b')).toBe(false); });
 it('collector or device name is mandatory', () => { expect(collectorNameValid('   ')).toBe(false); expect(collectorNameValid('Aisha — field device')).toBe(true); });
});