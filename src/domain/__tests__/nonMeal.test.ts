import { BULK_DRINK_ML, BULK_FOOD_G, BULK_KCAL, isMealCandidate, nonMealKind } from '../nonMeal';
import type { MenuItem } from '../types';
import { menu } from './fixtures';

const PKG = '식약처·전국통합식품영양성분정보(가공식품)';
const FOOD = '식약처·전국통합식품영양성분정보(음식)';
const pkg = (name: string, serving: string, kcal: number, category: MenuItem['category'] = 'meal') =>
  menu({ id: `gs25-mfds-${name}`, brandId: 'gs25', name, serving, category, nutrients: { kcal }, trust: 'official', sourceName: PKG });

describe('nonMealKind', () => {
  it('조리용 표시는 어디서든 식재료', () => {
    expect(nonMealKind(pkg('유어스 국산콩두부 찌개/부침겸용', '1인분 (600 g)', 510))).toBe('ingredient');
    expect(nonMealKind(menu({ id: 'r', name: '한우 국거리', sourceName: FOOD, category: 'meal' }))).toBe('ingredient');
  });

  it('가공식품 원물·양념 (이름 끝말)', () => {
    for (const n of ['리얼프라이스 국산콩 왕두부', '유기농 우리밀 밀가루', '리얼프라이스 베이컨', '동성식품에서 만든 치즈떡볶이떡', '라면사리', '특란 30구', '국산콩두부 (300g)']) {
      expect(nonMealKind(pkg(n, '1인분 (100 g)', 200))).toBe('ingredient');
    }
  });

  it('바로 먹는 것은 걸리지 않는다', () => {
    for (const n of ['구운란', '구운계란', '훈제 닭가슴살', '누룽지북어국밥', '리얼프라이스 김치볶음밥', '비빔면', '마파두부', '유어스 가쓰오 우동', '양념치킨 도시락']) {
      expect(nonMealKind(pkg(n, '1인분 (230 g)', 400))).toBeNull();
    }
    // 식당 메뉴(음식 데이터셋)는 원물 끝말 규칙을 쓰지 않는다 — "해물순두부"는 찌개
    expect(nonMealKind(menu({ id: 'f', name: '해물순두부', sourceName: FOOD, category: 'meal', serving: '1인분 (700 g)', nutrients: { kcal: 500 } }))).toBeNull();
  });

  it('가공식품 대용량: 음료 900 ml↑ · 1 kg↑ · 1,200 kcal↑', () => {
    expect([BULK_DRINK_ML, BULK_FOOD_G, BULK_KCAL]).toEqual([900, 1000, 1200]);
    expect(nonMealKind(pkg('순백목장우유', '1인분 (1800 ml)', 1260, 'drink'))).toBe('bulk');
    expect(nonMealKind(pkg('1974 우유', '1인분 (900 ml)', 540, 'drink'))).toBe('bulk');
    expect(nonMealKind(pkg('블랙아메리카노', '1인분 (1.0 L)', 50, 'drink'))).toBe('bulk');
    expect(nonMealKind(pkg('대용량 과자', '1인분 (1.2 kg)', 900, 'snack'))).toBe('bulk');
    expect(nonMealKind(pkg('패밀리 도시락', '1인분 (700 g)', 1300))).toBe('bulk');
    expect(nonMealKind(pkg('흰우유', '1인분 (200 ml)', 130, 'drink'))).toBeNull();
    expect(nonMealKind(pkg('유어스 CAFE25 아메리카노 블랙', '1인분 (500 ml)', 20, 'drink'))).toBeNull();
  });

  it('카페 빅사이즈 음료는 1인분이라 대용량이 아니다', () => {
    const venti = menu({ id: 'v', brandId: 'the_venti', name: '딸기 라떼 아이스(ICED) (더벤티)', serving: '1인분 (960 ml)', nutrients: { kcal: 518 }, trust: 'official', sourceName: FOOD });
    expect(isMealCandidate(venti)).toBe(true);
    expect(isMealCandidate(menu({ id: 'seed' }))).toBe(true);
  });
});
