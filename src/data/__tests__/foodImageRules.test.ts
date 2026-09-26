import { foodImageKey, storeImageKey } from '../foodImageRules';

describe('foodImageKey', () => {
  it.each([
    ['돼지국밥', 'meal', 'gukbap'],
    ['아이스 카페 라떼', 'drink', 'latte'],
    ['아이스 카페 아메리카노', 'drink', 'americano'],
    ['황금올리브 반마리', 'meal', 'fried_chicken'],
    ['김치찌개', 'meal', 'kimchi_jjigae'],
    ['버터 크루아상', 'snack', 'croissant'],
    ['팝콘', 'snack', 'chips'],
    ['녹차트러플', 'snack', 'snack_generic'],
  ] as const)('%s → %s', (name, category, key) => {
    expect(foodImageKey({ name, category })).toBe(key);
  });

  it('음료 메뉴는 음식 이미지로 안 간다', () => {
    expect(foodImageKey({ name: '아이스 치킨 음료', category: 'drink' })).not.toBe('fried_chicken');
  });

  it('단서가 없으면 분류 폴백', () => {
    expect(foodImageKey({ name: '어라?어라', category: 'meal' })).toBe('meal_generic');
  });
});

describe('storeImageKey', () => {
  it('동네 국밥집은 국밥 이미지', () => {
    expect(storeImageKey({ category: 'korean', name: '역삼 돼지국밥', placeCategory: '음식점 > 한식 > 국밥' })).toBe('store_gukbap');
  });
  it('치킨 브랜드는 치킨집', () => {
    expect(storeImageKey({ category: 'fastfood', brandName: 'BBQ', name: 'BBQ 역삼점' })).toBe('store_chicken');
  });
  it('단서 없으면 매장 분류', () => {
    expect(storeImageKey({ category: 'convenience', name: '어딘가' })).toBe('store_convenience');
  });
});
