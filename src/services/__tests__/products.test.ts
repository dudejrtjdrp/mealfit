jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { PACKAGED_BRAND_ID } from '../../data/ingest/nutrition';
import { productRowToMenu, type ProductRow } from '../products';

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
