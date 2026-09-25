/**
 * 일반 음식(대표 음식 — 돼지국밥·김치찌개처럼 브랜드 없는 식당·집밥 음식, 식약처 음식 데이터 업체명 '해당없음').
 * 2026-09-26 효님: "돼지국밥이 90 kcal 로 나온다 — 식당 한 그릇이 그럴 리 없다(700~850)". 원인은 앱에 브랜드 메뉴·시판 제품만 있어
 * 검색·비슷한 메뉴·AI 맞추기가 레토르트 팩(양반 뚝배기 돼지국밥 282 g 90 kcal — 국물만, 밥 없음)으로 빠지던 것.
 */
import { applyOptions } from '../../domain/judge';
import { menuQtyUnit } from '../../domain/qty';
import {
  estimatedMenusForPlace,
  findGenericDish,
  getBrand,
  getBrands,
  getGenericDishes,
  getMenu,
  getMenusByBrand,
  matchBrand,
  menusForStore,
  normalizeName,
  searchMenus,
} from '../index';
import { GENERIC_BRAND_ID } from '../ingest/nutrition';
import { PLACE_DISH_RULES, PLACE_EST_ID_SUFFIX, placeDishQueries } from '../placeDishes';
import { matchTier, rankKey } from '../searchRank';

describe('번들 (src/data/generated/mfds-dishes.json)', () => {
  it('지연 로드 번들은 1MB 이하 — 시작 번들(brands·menus·mfds 5MB)과 따로 잰다', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const bytes = fs.statSync(path.join(__dirname, '..', 'generated/mfds-dishes.json')).size;
    expect(bytes).toBeLessThanOrEqual(1 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(100 * 1024); // 비어 있지 않다
  });

  it('1.5천 개 이상, id 는 gen- 로 시작하고 겹치지 않는다, 전부 일반 식당 브랜드·식약처 음식 출처', () => {
    const list = getGenericDishes();
    expect(list.length).toBeGreaterThan(1500);
    expect(new Set(list.map((m) => m.id)).size).toBe(list.length);
    for (const m of list) {
      expect(m.id.startsWith('gen-')).toBe(true);
      expect(m.brandId).toBe(GENERIC_BRAND_ID);
      expect(m.trust).toBe('official');
      expect(m.sourceUrl).toBe('https://www.data.go.kr/data/15100070/standard.do');
      expect(m.sourceName).toBe('식약처·전국통합식품영양성분정보(음식)');
      expect(m.nutrients?.kcal).toBeGreaterThanOrEqual(0);
      expect(m.servingNote).toMatch(/요$/);
      expect(m.name).not.toMatch(/_/);
    }
    expect(getMenusByBrand(GENERIC_BRAND_ID)).toBe(list);
  });

  it('제공량은 "1인분 (N g|ml)" (데이터셋 식품중량) 이거나, 1인분 중량이 없어 "100 g|ml 기준" + 이유 한 줄', () => {
    for (const m of getGenericDishes()) {
      expect(m.serving).toMatch(/^(1인분 \(\d+ (g|ml)\)|100 (g|ml) 기준)$/);
      if (m.serving.endsWith('기준')) expect(m.servingNote).toMatch(/1인분 양 정보가 없어/);
      expect(menuQtyUnit(m)).toBe('인분');
    }
  });

  it('일반 식당 가상 브랜드는 매장 키워드가 없다 — 장소 이름과 매칭되거나 주변 매장 브랜드로 나오지 않는다', () => {
    const b = getBrand(GENERIC_BRAND_ID);
    expect(b).toMatchObject({ name: '일반 식당', matchKeywords: [] });
    expect(matchBrand('일반 식당')).toBeUndefined();
    expect(matchBrand('역삼 돼지국밥')).toBeUndefined();
    expect(getBrands().filter((x) => x.matchKeywords.length === 0).map((x) => x.id).sort()).toEqual(['generic', 'packaged']);
  });
});

describe('대표 음식 전후 (식당 1인분)', () => {
  it.each([
    // [찾는 말, 일반 음식 이름, 제공량, kcal 하한, 상한]
    ['돼지국밥', '돼지고기 국밥', '1인분 (1200 g)', 850, 950],
    ['순대국밥', '순대국밥', '1인분 (900 g)', 600, 750],
    ['김치찌개', '김치찌개', '1인분 (400 g)', 200, 300],
    ['제육볶음', '돼지고기볶음 (제육볶음)', '1인분 (250 g)', 450, 520],
    ['비빔밥', '비빔밥', '1인분 (530 ml)', 650, 750],
    ['짜장면', '자장면', '1인분 (650 g)', 750, 850],
  ])('%s → %s %s', (q, name, serving, lo, hi) => {
    const d = findGenericDish(q)!;
    expect(d).toMatchObject({ name, serving, trust: 'official' });
    expect(d.nutrients!.kcal).toBeGreaterThanOrEqual(lo);
    expect(d.nutrients!.kcal).toBeLessThanOrEqual(hi);
  });

  it('국·찌개(밥 빠진 값)는 공기밥을 따로 더하라고 알려 준다, 국밥은 밥이 들어 있어 알리지 않는다', () => {
    expect(findGenericDish('김치찌개')!.servingNote).toMatch(/공기밥은 따로 더해요$/);
    expect(findGenericDish('돼지국밥')!.servingNote).not.toMatch(/공기밥/);
  });
});

describe('검색 순위 — 음식 이름이면 식당 1인분(일반 음식)이 레토르트보다 앞', () => {
  it.each(['돼지국밥', '돼지 국밥', '국밥 돼지고기', '순대국밥', '김치찌개', '제육볶음', '된장찌개', '비빔밥', '짜장면', '떡볶이', '삼겹살', '부대찌개'])('%s → 1위는 일반 음식', (q) => {
    const top = searchMenus(q, 5);
    expect(top[0].brandId).toBe(GENERIC_BRAND_ID);
    // 이름이 같은 시판 제품(레토르트)이 있어도 그보다 앞
    const firstPkg = searchMenus(q, 200).findIndex((m) => m.brandId === 'packaged');
    if (firstPkg >= 0) expect(firstPkg).toBeGreaterThan(0);
  });

  it('돼지국밥: 양반 뚝배기 돼지국밥(282 g 90 kcal)이 아니라 돼지고기 국밥 1,200 g', () => {
    const list = searchMenus('돼지국밥', 50);
    expect(list[0]).toMatchObject({ name: '돼지고기 국밥', serving: '1인분 (1200 g)' });
    const yangban = list.findIndex((m) => /양반.*돼지국밥/.test(m.name));
    if (yangban >= 0) expect(yangban).toBeGreaterThan(0);
  });

  it('브랜드를 말하면 그 브랜드가 먼저 (일반 음식 "식당" 이름으로 브랜드 검색이 흐려지지 않는다)', () => {
    expect(searchMenus('스타벅스', 20).every((m) => m.brandId === 'starbucks')).toBe(true);
    expect(searchMenus('본죽 전복죽', 5).some((m) => m.brandId === GENERIC_BRAND_ID)).toBe(false);
    expect(searchMenus('양반 돼지국밥', 5).some((m) => m.brandId === GENERIC_BRAND_ID)).toBe(false);
    expect(searchMenus('식당', 50).some((m) => m.brandId === GENERIC_BRAND_ID)).toBe(false);
  });

  it('matchTier: 다른 이름이 같으면 0단계 ("돼지국밥" = 돼지고기 국밥)', () => {
    const d = findGenericDish('돼지국밥')!;
    expect(matchTier('돼지국밥', rankKey(d, '일반 식당'))).toBe(0);
    expect(matchTier(normalizeName('국밥 돼지고기'), rankKey(d, '일반 식당'))).toBe(0);
    expect(matchTier('일반식당', rankKey(d, '일반 식당'))).toBe(-1);
  });
});

describe('동네 식당 → 대표 음식 추정 (일반 식당 기준)', () => {
  it('placeDishQueries: 이름 단서가 분류보다 먼저, 술집·카페·단서 없음은 빈 목록', () => {
    expect(placeDishQueries('할매 돼지국밥', '음식점 > 한식 > 국밥').slice(0, 2)).toEqual(['돼지국밥', '순대국밥']);
    expect(placeDishQueries('역삼 순대국', '음식점 > 한식 > 국밥')[0]).toBe('순대국');
    expect(placeDishQueries('홍콩반점0410', '음식점 > 중식 > 중국요리').slice(0, 2)).toEqual(['짜장면', '짬뽕']);
    expect(placeDishQueries('동네식당', '음식점 > 한식')).toEqual(['김치찌개', '된장찌개', '제육볶음', '비빔밥']);
    expect(placeDishQueries('역삼 호프', '음식점 > 술집 > 호프,요리주점')).toEqual([]);
    expect(placeDishQueries('동네 커피', '음식점 > 카페')).toEqual([]);
    expect(placeDishQueries('해물 맛집', '음식점 > 한식 > 해물,생선')).toEqual([]);
    expect(placeDishQueries('동네 식당')).toEqual([]);
  });

  it('규칙의 음식 이름은 대부분 일반 음식 1인분으로 찾힌다 (규칙이 조용히 죽지 않게)', () => {
    const names = [...new Set(PLACE_DISH_RULES.flatMap((r) => r.dishes))];
    const found = names.filter((n) => findGenericDish(n)?.serving.startsWith('1인분'));
    expect(found.length / names.length).toBeGreaterThan(0.9);
    // 모든 규칙이 적어도 하나는 찾는다
    for (const r of PLACE_DISH_RULES) expect(r.dishes.some((n) => findGenericDish(n)?.serving.startsWith('1인분'))).toBe(true);
  });

  it('"○○돼지국밥" → 돼지국밥·순대국밥… 추정(estimated) + 이유 한 줄, id 는 -est, 원래 일반 음식과 값은 같다', () => {
    const menus = estimatedMenusForPlace('할매 돼지국밥', '음식점 > 한식 > 국밥');
    expect(menus.length).toBeGreaterThanOrEqual(3);
    expect(menus.length).toBeLessThanOrEqual(6);
    expect(menus[0].name).toBe('돼지고기 국밥');
    for (const m of menus) {
      expect(m.trust).toBe('estimated');
      expect(m.id.endsWith(PLACE_EST_ID_SUFFIX)).toBe(true);
      expect(m.serving.startsWith('1인분')).toBe(true);
      expect(m.servingNote).toMatch(/^이 가게 영양 정보가 아니라 일반 식당 기준으로 어림한 값이에요\. .*요$/);
      expect(m.tags).toContain('일반 식당 기준');
      const base = getMenu(m.id.slice(0, -PLACE_EST_ID_SUFFIX.length))!;
      expect(m.nutrients).toEqual(base.nutrients);
      // 예전 기록·상세 화면이 id 로 다시 찾는다 (추정 그대로)
      expect(getMenu(m.id)).toMatchObject({ id: m.id, trust: 'estimated', nutrients: base.nutrients });
      expect(applyOptions(m)?.kcal).toBe(base.nutrients!.kcal);
    }
    // 같은 이름·분류는 같은 배열 (화면 메모이제이션)
    expect(estimatedMenusForPlace('할매 돼지국밥', '음식점 > 한식 > 국밥')).toBe(menus);
  });

  it('menusForStore: 브랜드 매장은 브랜드 메뉴, 브랜드 아닌 식당은 추정, 단서 없으면 빈 목록', () => {
    expect(menusForStore({ brandId: 'gs25', name: 'GS25 역삼점' })).toBe(getMenusByBrand('gs25'));
    expect(menusForStore({ name: '역삼 찌개집', placeCategory: '음식점 > 한식 > 찌개,전골' }).map((m) => m.name)).toContain('김치찌개');
    expect(menusForStore({ name: '동네 식당' })).toEqual([]);
  });
});
