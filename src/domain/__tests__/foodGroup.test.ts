import { foodGroup } from '../foodGroup';

describe('foodGroup — 무엇을 먹는지로 나눈다', () => {
  it('샌드위치·햄버거·빵집 빵은 전부 빵 갈래 (효님 예시)', () => {
    expect(foodGroup({ name: '에그 샌드위치', category: 'meal', storeCategory: 'cafe' })).toBe('bread');
    expect(foodGroup({ name: '싸이버거', category: 'meal', storeCategory: 'fastfood' })).toBe('bread');
    expect(foodGroup({ name: '치즈듬뿍어니언', category: 'meal', storeCategory: 'bakery' })).toBe('bread');
    expect(foodGroup({ name: '닭가슴살 랩', category: 'meal', storeCategory: 'salad' })).toBe('bread');
    expect(foodGroup({ name: '허니 고르곤졸라 스퀘어 피자', category: 'meal', storeCategory: 'cafe' })).toBe('bread');
  });

  it('매장 힌트 — 서브웨이는 이름에 치킨이 있어도 샌드위치, 카페 식사도 샌드위치류', () => {
    expect(foodGroup({ name: '로스트 치킨', category: 'meal', storeName: '서브웨이 역삼역점', storeCategory: 'fastfood' })).toBe('bread');
    expect(foodGroup({ name: '스파이시 이탈리안', category: 'meal', storeName: '서브웨이 역삼역점' })).toBe('bread');
    expect(foodGroup({ name: '로스트 치킨 샐러드', category: 'salad', storeName: '서브웨이 역삼역점' })).toBe('salad');
    expect(foodGroup({ name: '치킨 클럽', category: 'meal', storeName: '스타벅스 역삼역점', storeCategory: 'cafe' })).toBe('bread');
    expect(foodGroup({ name: '초코크림아몬드볼', category: 'snack', storeCategory: 'bakery' })).toBe('bread');
  });

  it('밥·면·국·죽·분식·샐러드', () => {
    expect(foodGroup({ name: '참치마요 삼각김밥' })).toBe('rice');
    expect(foodGroup({ name: '리얼프라이스 김치볶음밥' })).toBe('rice');
    expect(foodGroup({ name: '까르보나라 구운주먹밥', category: 'meal', storeCategory: 'cafe' })).toBe('rice');
    expect(foodGroup({ name: '헤이루 제육 도시락' })).toBe('rice');
    expect(foodGroup({ name: '수미네 묵은지 김치찌개라면' })).toBe('noodle');
    expect(foodGroup({ name: '신라면 큰사발' })).toBe('noodle');
    expect(foodGroup({ name: '토마토 파스타' })).toBe('noodle');
    expect(foodGroup({ name: '누룽지미역국밥' })).toBe('soup');
    expect(foodGroup({ name: '갈비탕' })).toBe('soup');
    expect(foodGroup({ name: '전복죽' })).toBe('porridge');
    expect(foodGroup({ name: '쇠고기야채', storeName: '본죽 역삼점' })).toBe('porridge');
    expect(foodGroup({ name: '국물 떡볶이' })).toBe('bunsik');
    expect(foodGroup({ name: '닭가슴살 포케' })).toBe('salad');
    expect(foodGroup({ name: '야채감자 샐러드고로케', category: 'salad', storeCategory: 'bakery' })).toBe('bread');
  });

  it('고기 단품 · 가벼운 간식 · 디저트 · 음료', () => {
    expect(foodGroup({ name: '후라이드 치킨 반마리' })).toBe('protein');
    expect(foodGroup({ name: '군고구마', category: 'snack', storeCategory: 'convenience' })).toBe('light');
    expect(foodGroup({ name: '그릭요거트 플레인', category: 'snack', storeCategory: 'cafe' })).toBe('light');
    expect(foodGroup({ name: '레드벨벳 크림치즈 케이크', category: 'snack', storeCategory: 'cafe' })).toBe('sweets');
    expect(foodGroup({ name: '주상절리 파이', category: 'snack' })).toBe('sweets');
    expect(foodGroup({ name: '갈릭새우칩', category: 'snack', storeCategory: 'convenience' })).toBe('sweets');
    expect(foodGroup({ name: '카페 라떼', category: 'drink' })).toBe('drink');
  });

  it('기록(분류 없음)은 매장 이름으로 매장 종류를 짐작한다', () => {
    expect(foodGroup({ name: '치즈듬뿍어니언', storeName: '파리바게뜨 역삼점' })).toBe('bread');
    expect(foodGroup({ name: '에그마요', storeName: '서브웨이 강남점' })).toBe('bread');
    expect(foodGroup({ name: '알 수 없는 메뉴' })).toBe('other');
  });
});
