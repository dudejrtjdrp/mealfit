jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { PACKAGED_BRAND_ID } from '../../data/ingest/nutrition';
import type { MenuItem } from '../../domain/types';
import { pickSimilar, productRowToMenu, type ProductRow } from '../products';

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

  it('같은 이름 > 검색어로 시작 > 길이 차이가 작은 순, 영양 없는 건 건너뛴다', () => {
    const list = [m('1', '참치 김치찌개 도시락'), m('2', '김치찌개라면'), m('3', '김치찌개', { nutrients: null, trust: 'none' }), m('4', '돼지 김치찌개')];
    expect(pickSimilar('김치찌개', list)?.id).toBe('2');
    expect(pickSimilar('김치찌개', [...list, m('5', '김치 찌개')])?.id).toBe('5');
    expect(pickSimilar('김치찌개', [m('6', '된장국', { nutrients: null, trust: 'none' })])).toBeUndefined();
    expect(pickSimilar('  ', list)).toBeUndefined();
  });
});
