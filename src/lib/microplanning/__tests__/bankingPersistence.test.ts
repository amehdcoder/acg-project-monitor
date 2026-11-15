import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: 'banking-test-user',
  networkFails: false,
  rows: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.user } } } }) },
    from: () => ({
      insert: async (values: Record<string, unknown>) => {
        if (state.networkFails) throw new TypeError('Failed to fetch');
        const id = String(values.id);
        if (state.rows.has(id)) return { error: { code: '23505', message: 'Duplicate id' } };
        state.rows.set(id, JSON.parse(JSON.stringify(values)));
        return { error: null };
      },
      update: (values: Record<string, unknown>) => ({
        eq: (_field: string, id: string) => ({
          select: async () => {
            if (state.networkFails) throw new TypeError('Failed to fetch');
            if (!state.rows.has(id)) return { data: [], error: null };
            state.rows.set(id, { ...state.rows.get(id), ...JSON.parse(JSON.stringify(values)) });
            return { data: [{ id }], error: null };
          },
        }),
      }),
    }),
  },
}));

import { offlineMutate } from '../../programmeModule/offlineWrite';
import { flushQueue, listQueued } from '../../programmeModule/offlineQueue';

const details = {
  project_id: 'banking-test-project', created_by: 'banking-test-user', updated_by: 'banking-test-user',
  cdd_account_name: 'CDD Test Account', cdd_account_number: '0123456789', cdd_bank: 'Access Bank',
  flhf_account_name: 'Facility Test Account', flhf_account_number: '0012345678', flhf_bank: 'Typed Community Bank',
};
const online = (value: boolean) => Object.defineProperty(navigator, 'onLine', { value, configurable: true });

describe('banking persistence through the actual offline write queue', () => {
  beforeEach(() => {
    localStorage.clear(); state.rows.clear(); state.user = 'banking-test-user'; state.networkFails = false; online(true);
  });

  it('saves both banking groups online as text and preserves leading zeros', async () => {
    const saved = await offlineMutate({ table: 'microplan_entries', action: 'insert', values: details });
    expect(saved.queued).toBe(false);
    expect(state.rows.get(String(saved.id))).toMatchObject(details);
  });

  it('persists edits and intentional clearing without restoring old bank details', async () => {
    state.rows.set('entry', { ...details, id: 'entry' });
    await offlineMutate({ table: 'microplan_entries', action: 'update', id: 'entry', values: {
      cdd_account_number: '0001234567', flhf_bank: 'Another Typed Bank',
    } });
    expect(state.rows.get('entry')).toMatchObject({ cdd_account_number: '0001234567', flhf_bank: 'Another Typed Bank' });
    const cleared = Object.fromEntries(Object.keys(details).filter(key => /^(cdd|flhf)_/.test(key)).map(key => [key, '']));
    await offlineMutate({ table: 'microplan_entries', action: 'update', id: 'entry', values: cleared });
    expect(state.rows.get('entry')).toMatchObject(cleared);
  });

  it('replays an offline creation and subsequent banking edit once with the latest values', async () => {
    online(false);
    const saved = await offlineMutate({ table: 'microplan_entries', action: 'insert', values: details });
    const edit = { cdd_account_number: '0009876543', flhf_account_number: '0098765432', updated_by: state.user };
    await offlineMutate({ table: 'microplan_entries', action: 'update', id: saved.id, values: edit });
    expect(listQueued()[0].payload.values).toMatchObject(details);
    expect(listQueued()[0].user_id).toBe('banking-test-user');
    expect(listQueued().at(-1)?.payload.values).toMatchObject(edit);
    online(true);
    expect(await flushQueue()).toEqual({ sent: 2, failed: 0 });
    expect(state.rows.size).toBe(1);
    expect(state.rows.get(String(saved.id))).toMatchObject({ ...details, ...edit });
    expect(listQueued()).toHaveLength(0);
    expect(await flushQueue()).toEqual({ sent: 0, failed: 0 });
  });

  it('retains banking values when a live request loses connectivity and retries', async () => {
    state.networkFails = true;
    const saved = await offlineMutate({ table: 'microplan_entries', action: 'insert', values: details });
    expect(saved.queued).toBe(true);
    expect(listQueued()[0].payload.values).toMatchObject(details);
    state.networkFails = false;
    expect(await flushQueue()).toEqual({ sent: 1, failed: 0 });
    expect(state.rows.get(String(saved.id))).toMatchObject(details);
  });

  it('never replays another account’s banking queue on a shared device', async () => {
    online(false);
    await offlineMutate({ table: 'microplan_entries', action: 'insert', values: details });
    state.user = 'different-user'; online(true);
    expect(await flushQueue()).toEqual({ sent: 0, failed: 0 });
    expect(state.rows.size).toBe(0);
    expect(listQueued()).toHaveLength(1);
  });
});