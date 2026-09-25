import type { SupabaseClient } from '@supabase/supabase-js';

import { hasRequestedInfo, listInfoRequests, requestKey, requestStoreInfo, type InfoRequestDeps } from '../infoRequests';
import type { KeyValueStorage } from '../repo/local';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function memStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

/** insert 결과를 정할 수 있는 가짜 Supabase */
function fakeClient(result: (row: Record<string, unknown>) => { error: { message: string; code?: string } | null }) {
  const rows: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        expect(table).toBe('info_requests');
        const r = result(row);
        if (!r.error) rows.push(row);
        return r;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, rows };
}

const NOW = () => new Date('2026-09-25T03:00:00.000Z');
const BONJUK = { name: '본죽 역삼점', brandId: 'bonjuk', placeId: '12345' };

describe('requestKey', () => {
  it('place id > 브랜드 > 이름', () => {
    expect(requestKey(BONJUK)).toBe('place:12345');
    expect(requestKey({ name: '본죽', brandId: 'bonjuk' })).toBe('brand:bonjuk');
    expect(requestKey({ name: ' 동네 김밥 ' })).toBe('name:동네김밥');
  });
});

describe('requestStoreInfo', () => {
  it('로그인 안 했으면 이 기기에만 쌓고, 같은 매장은 한 번만', async () => {
    const storage = memStorage();
    const deps: Partial<InfoRequestDeps> = { storage, client: null, userId: null, now: NOW };
    expect(await hasRequestedInfo(BONJUK, deps)).toBe(false);
    expect(await requestStoreInfo(BONJUK, deps)).toEqual({ already: false, synced: false });
    expect(await hasRequestedInfo(BONJUK, deps)).toBe(true);
    expect(await requestStoreInfo(BONJUK, deps)).toEqual({ already: true, synced: false });
    const list = await listInfoRequests(deps);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: 'place:12345', name: '본죽 역삼점', brandId: 'bonjuk', createdAt: '2026-09-25T03:00:00.000Z' });
  });

  it('로그인했으면 서버에 넣는다 (user id·이름·place id·시각)', async () => {
    const storage = memStorage();
    const { client, rows } = fakeClient(() => ({ error: null }));
    const r = await requestStoreInfo(BONJUK, { storage, client, userId: 'u1', now: NOW });
    expect(r).toEqual({ already: false, synced: true });
    expect(rows).toEqual([
      { user_id: 'u1', request_key: 'place:12345', store_name: '본죽 역삼점', brand_id: 'bonjuk', kakao_place_id: '12345', created_at: '2026-09-25T03:00:00.000Z' },
    ]);
  });

  it('테이블이 없어서 실패해도 던지지 않고 로컬에 남긴다 → 다음 요청 때 같이 다시 올린다', async () => {
    const storage = memStorage();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let tableReady = false;
    const { client, rows } = fakeClient(() => (tableReady ? { error: null } : { error: { message: 'relation "info_requests" does not exist', code: '42P01' } }));

    const r1 = await requestStoreInfo(BONJUK, { storage, client, userId: 'u1', now: NOW });
    expect(r1).toEqual({ already: false, synced: false });
    expect(await hasRequestedInfo(BONJUK, { storage })).toBe(true);

    tableReady = true;
    const r2 = await requestStoreInfo({ name: '메가MGC커피 역삼점', brandId: 'mega' }, { storage, client, userId: 'u1', now: NOW });
    expect(r2.synced).toBe(true);
    expect(rows.map((x) => x.request_key)).toEqual(['place:12345', 'brand:mega']);
    expect((await listInfoRequests({ storage })).every((e) => e.synced)).toBe(true);
    warn.mockRestore();
  });

  it('서버에 이미 있으면(유니크 위반) 올라간 것으로 본다', async () => {
    const storage = memStorage();
    const { client } = fakeClient(() => ({ error: { message: 'duplicate key', code: '23505' } }));
    expect((await requestStoreInfo(BONJUK, { storage, client, userId: 'u1', now: NOW })).synced).toBe(true);
  });

  it('네트워크 예외도 삼킨다', async () => {
    const storage = memStorage();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { from: () => ({ insert: async () => Promise.reject(new Error('offline')) }) } as unknown as SupabaseClient;
    await expect(requestStoreInfo(BONJUK, { storage, client, userId: 'u1', now: NOW })).resolves.toEqual({ already: false, synced: false });
    warn.mockRestore();
  });

  it('깨진 로컬 값은 빈 목록으로 본다', async () => {
    const storage = memStorage();
    storage.data.set('mealfit:info-requests', '{깨짐');
    expect(await hasRequestedInfo(BONJUK, { storage })).toBe(false);
  });
});
