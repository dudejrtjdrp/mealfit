jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { PACKAGED_BRAND_ID } from '../../data/ingest/nutrition';
import type { MenuItem } from '../../domain/types';
import { findSimilarMenu, pickSimilar, productRowToMenu, type ProductRow } from '../products';

describe('서버 제품 행 → MenuItem', () => {
  const row: ProductRow = {
    id: 'pkg-p1', name: '신라면', maker: '농심', category: 'meal', serving: '1개 (120 g)', serving_note: null,
    kcal: 500, carbs: 79, protein: 11, fat: 15, sat_fat: 7, sugar: 4, sodium: 1790, caffeine: null,
  };

  it('영양·제조사·신뢰등급을 채우고 null 은 넣지 않는다 (0으로 지어내지 않기)', () => {
    const m = productRowToMenu(row);
    expect(m).toMatchObject({ id: 'pkg-p1', brandId: PACKAGED_BRAND_ID, name: '신라면', maker: '농심', trust: 'official', category: 'meal' });
    expect(m.nutrients).toEqual({ kcal: 500, carbs: 79, protein: 11, fat: 15, satFat: 7, sugar: 4, sodium: 1790 });
    expect(m.sourceUrl).toContain('data.go.kr');
  });

  it('모르는 카테고리는 snack 으로, 카페인 있으면 태그를 단다', () => {
    const m = productRowToMenu({ ...row, category: 'weird', caffeine: 60 });
    expect(m.category).toBe('snack');
    expect(m.tags).toEqual(['카페인 있음']);
  });
});

describe('비슷한 메뉴 고르기 (직접 입력 · 잘 모르겠어요)', () => {
  const m = (id: string, name: string, over: Partial<MenuItem> = {}): MenuItem => ({ id, brandId: 'b', name, category: 'meal', serving: '1인분', nutrients: { kcal: 500 }, trust: 'official', ...over });

  it('같은 이름 > 이름의 머리(끝)가 검색어 > 꾸밈말 자리, 영양 없는 건 건너뛴다', () => {
    const list = [m('1', '참치 김치찌개 도시락'), m('2', '김치찌개라면'), m('3', '김치찌개', { nutrients: null, trust: 'none' }), m('4', '돼지 김치찌개')];
    // "김치찌개라면"은 라면, "돼지 김치찌개"가 김치찌개
    expect(pickSimilar('김치찌개', list)?.id).toBe('4');
    expect(pickSimilar('김치찌개', [...list, m('5', '김치 찌개')])?.id).toBe('5');
    expect(pickSimilar('김치찌개', [m('6', '된장국', { nutrients: null, trust: 'none' })])).toBeUndefined();
    expect(pickSimilar('  ', list)).toBeUndefined();
  });

  it('같은 단계면 매장 메뉴가 시판 제품보다 앞, 이름 길이 차이가 작은 순', () => {
    const list = [m('p', '양념 치킨', { brandId: PACKAGED_BRAND_ID, maker: '하림' }), m('a', '스노윙 치킨'), m('b', '치킨 클럽'), m('c', '후라이드 치킨')];
    expect(pickSimilar('치킨', list)?.id).toBe('a');
  });
});

describe('findSimilarMenu — 앱 데이터 회귀 (치킨·황금올리브·라면·콜라·사과)', () => {
  it('치킨 → 스타벅스 치킨 클럽이 아니라 치킨 브랜드의 치킨', async () => {
    const hit = await findSimilarMenu('치킨');
    expect(['bbq', 'kyochon', 'goobne']).toContain(hit?.brandId);
    expect(hit?.name).toMatch(/치킨$/);
  });

  it('황금올리브 → BBQ 황금올리브 치킨', async () => {
    expect(await findSimilarMenu('황금올리브')).toMatchObject({ brandId: 'bbq', name: '황금올리브 치킨' });
  });

  it('라면 → 라면왕김통깨가 아니라 라면', async () => {
    const hit = await findSimilarMenu('라면');
    expect(hit?.name).not.toBe('라면왕김통깨');
    expect(hit?.name).toMatch(/라면$/);
  });

  it('콜라 → 콜라 (콜라겐 스무디·쇼콜라 아님)', async () => {
    expect((await findSimilarMenu('콜라'))?.name).toBe('콜라');
  });

  it('사과 → 사과유자차가 아니라 사과', async () => {
    expect((await findSimilarMenu('사과'))?.name).toBe('사과');
  });
});
