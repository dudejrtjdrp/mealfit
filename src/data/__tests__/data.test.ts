import { haversineM } from '../../domain/geo';
import { judgeMenu, nonMealKind, rankMenus } from '../../domain/judge';
import { drinkKey, mergeSeedOptionsIntoOfficial } from '../dedupe';
import { applyPerSlice, cakeKey, PIZZA_SLICES, pizzaSize, SLICE_ID_SUFFIX, toSlice } from '../perSlice';
import { menuQtyUnit } from '../../domain/qty';
import {
  getBrand,
  getBrands,
  getMenu,
  getMenus,
  getMenusByBrand,
  getMergedSeedCounts,
  getPerSliceCounts,
  getMockStores,
  getSeedPolicy,
  matchBrand,
  normalizeName,
  searchMenus,
} from '../index';
import type { MenuItem } from '../../domain/types';

const CENTER = { lat: 37.5006, lng: 127.0366 };

describe('시드 데이터', () => {
  it('메뉴 150개 이상, id 중복 없음, 브랜드 참조 유효', () => {
    const menus = getMenus();
    expect(menus.length).toBeGreaterThanOrEqual(150);
    expect(new Set(menus.map((m) => m.id)).size).toBe(menus.length);
    for (const m of menus) expect(getBrand(m.brandId)).toBeDefined();
    expect(new Set(getBrands().map((b) => b.id)).size).toBe(getBrands().length);
  });

  it('official 은 sourceUrl 필수, none 은 nutrients null, 나머지는 kcal 있음', () => {
    for (const m of getMenus()) {
      if (m.trust === 'official') expect(m.sourceUrl).toMatch(/^https:\/\//);
      if (m.trust === 'none') expect(m.nutrients).toBeNull();
      else expect(typeof m.nutrients?.kcal).toBe('number');
    }
  });

  it('커버리지 none 브랜드는 메뉴가 전부 정보 없음, 편의점은 브랜드당 15개 이상', () => {
    for (const b of getBrands().filter((x) => x.coverage === 'none')) {
      const ms = getMenusByBrand(b.id);
      expect(ms.length).toBeGreaterThanOrEqual(3);
      expect(ms.every((m) => m.trust === 'none')).toBe(true);
    }
    for (const id of ['gs25', 'cu', 'seven_eleven']) expect(getMenusByBrand(id).length).toBeGreaterThanOrEqual(15);
  });

  it('옵션: 기본 선택이 그룹마다 하나', () => {
    for (const m of getMenus()) {
      for (const g of m.options ?? []) expect(g.choices.filter((c) => c.isDefault)).toHaveLength(1);
    }
    const latte = getMenu('starbucks-iced-latte');
    expect(latte?.options?.map((g) => g.label)).toEqual(['사이즈', '우유 변경']);
  });

  it('모든 메뉴가 판정 가능하다', () => {
    const remaining = { kcal: 842, carbs: 128, protein: 44, fat: 42, sugar: 30, sodium: 1200, emphasis: [] as never[] };
    const profile = { primaryGoal: 'maintain' as const, secondaryGoals: [], diet: { type: 'balanced' as const, evidence: [], source: 'rule' as const } };
    for (const m of getMenus()) {
      const j = judgeMenu(m, remaining, { profile });
      expect(j.unknown).toBe(m.trust === 'none');
      expect(j.score).toBeGreaterThanOrEqual(-1);
      expect(j.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('공공데이터 번들 (src/data/generated/mfds.json)', () => {
  it('앱에 들어가는 영양 JSON 합계 5MB 이하', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const bytes = ['brands.json', 'menus.json', 'generated/mfds.json']
      .map((f) => fs.statSync(path.join(__dirname, '..', f)).size)
      .reduce((a, b) => a + b, 0);
    expect(bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('공공데이터 메뉴는 official · 데이터셋 출처 · 이름 있음 (1조각으로 나눈 피자만 estimated)', () => {
    for (const m of getMenus().filter((x) => x.sourceName?.startsWith('식약처'))) {
      if (m.id.endsWith(SLICE_ID_SUFFIX)) expect(m).toMatchObject({ trust: 'estimated', servingNote: expect.stringMatching(/^한 판\(\d+조각\) 영양을 나눈 1조각 기준이에요$/) });
      else expect(m.trust).toBe('official');
      expect(m.sourceUrl).toMatch(/^https:\/\/www\.data\.go\.kr\/data\/151000(70|66)\/standard\.do$/);
      expect(m.name.length).toBeGreaterThan(0);
    }
  });
});

describe('시드 정리 정책 (로더)', () => {
  it('공공데이터 official 20개 이상 브랜드는 옵션 없는 시드 estimated 가 목록에 없고, id 로는 여전히 찾힌다', () => {
    const policy = getSeedPolicy();
    expect(policy.cutoff).toBe(20);
    for (const brandId of Object.keys(policy.excludedByBrand)) {
      const ms = getMenusByBrand(brandId);
      expect(ms.filter((m) => m.trust === 'official').length).toBeGreaterThanOrEqual(20);
      // 남은 추정 메뉴는 전부 옵션이 있다 (D4 옵션 칩·구매 가이드용)
      expect(ms.filter((m) => m.trust === 'estimated').every((m) => (m.options?.length ?? 0) > 0)).toBe(true);
    }
    expect(policy.excluded + policy.kept).toBe((require('../menus.json') as unknown[]).length);
    if (policy.excludedByBrand.starbucks) {
      expect(getMenusByBrand('starbucks').some((m) => m.id === 'starbucks-ham-cheese-sandwich')).toBe(false);
      expect(getMenu('starbucks-ham-cheese-sandwich')?.trust).toBe('estimated'); // 예전 기록이 깨지지 않게
    }
  });

  it('스타벅스 D3 목록: 공식판과 겹치는 시드 옵션판은 빠지고, 우유·시럽 옵션은 공식판에서 고를 수 있다', () => {
    const sb = getMenusByBrand('starbucks');
    // 시드 "아이스 카페 라떼"(사이즈·우유) → 공식 "카페 라떼 아이스(ICED) (Tall)" 에 우유 옵션만 옮긴다(사이즈는 공식판이 따로 있다)
    expect(sb.some((m) => m.id === 'starbucks-iced-latte')).toBe(false);
    const iced = sb.filter((m) => m.trust === 'official' && drinkKey(m.name).base === '카페라떼' && drinkKey(m.name).temp === 'ice');
    expect(iced.length).toBeGreaterThanOrEqual(1);
    for (const m of iced) expect(m.options?.map((g) => g.label)).toEqual(['우유 변경']);
    expect(sb.filter((m) => m.options?.some((g) => g.id === 'syrup')).length).toBeGreaterThan(0);
    expect(getSeedPolicy().keptWithOptionsByBrand.starbucks).toBeGreaterThan(0);
  });
});

describe('같은 음료 중복 병합 (시드 옵션판 ↔ 공식 사이즈판)', () => {
  it('어느 브랜드 목록에도 같은 음료(이름·온도 정규화 후)가 시드 옵션판과 공식판으로 함께 있지 않다', () => {
    for (const b of getBrands()) {
      const ms = getMenusByBrand(b.id);
      const official = new Set(ms.filter((m) => m.trust === 'official').map((m) => JSON.stringify(drinkKey(m.name))));
      const officialBase = new Set(ms.filter((m) => m.trust === 'official').map((m) => drinkKey(m.name).base));
      for (const s of ms.filter((m) => m.trust === 'estimated' && m.options?.length)) {
        const k = drinkKey(s.name);
        expect(official.has(JSON.stringify(k)) || (k.temp === null && officialBase.has(k.base))).toBe(false);
      }
    }
    expect(getMergedSeedCounts().starbucks).toBeGreaterThanOrEqual(10);
  });

  it('뺀 시드판도 id 로는 그대로 찾힌다 (예전 기록의 menuId)', () => {
    for (const id of ['starbucks-iced-latte', 'starbucks-iced-americano', 'starbucks-caramel-macchiato']) {
      const m = getMenu(id);
      expect(m?.trust).toBe('estimated');
      expect(m?.options?.length).toBeGreaterThan(0);
      expect(getMenusByBrand('starbucks').some((x) => x.id === id)).toBe(false);
    }
  });

  it('시드판의 시럽·우유 옵션이 사라지지 않는다 — 공식판으로 옮겨지거나 시드판이 남는다', () => {
    const seeds = (require('../menus.json') as MenuItem[]).filter((m) => m.trust === 'estimated' && m.options?.some((g) => g.id !== 'size'));
    for (const s of seeds) {
      const listed = getMenusByBrand(s.brandId);
      if (listed.some((m) => m.id === s.id)) continue;
      const k = drinkKey(s.name);
      const carriers = listed.filter((m) => m.trust === 'official' && drinkKey(m.name).base === k.base);
      if (!carriers.length) continue; // 다른 정책(mergeMenus)으로 빠진 시드
      for (const g of s.options!.filter((x) => x.id !== 'size')) {
        expect(carriers.some((m) => m.options?.some((x) => x.id === g.id))).toBe(true);
      }
    }
  });

  it('옮긴 옵션도 판정 구매 가이드에 쓰인다 (공식 카라멜 마키아또 "시럽 빼면")', () => {
    const macchiato = getMenusByBrand('starbucks').find(
      (m) => m.trust === 'official' && drinkKey(m.name).base === '카라멜마키아또' && m.options?.some((g) => g.id === 'syrup'),
    );
    expect(macchiato).toBeDefined();
    const remaining = { kcal: 300, carbs: 128, protein: 44, fat: 42, sugar: 30, sodium: 1200, emphasis: ['carbs', 'protein', 'fat'] as ('carbs' | 'protein' | 'fat')[] };
    const profile = { primaryGoal: 'maintain' as const, secondaryGoals: [], diet: { type: 'balanced' as const, evidence: [], source: 'rule' as const } };
    const guides = [8, 12, 19].map((h) => judgeMenu(macchiato!, remaining, { profile, now: new Date(2026, 8, 15, h) }).guide);
    expect(guides.some((g) => g?.startsWith('시럽 빼면'))).toBe(true);
  });
});

describe('조리용 식재료·대용량 (nonMealKind) — 추천·순위에서 빼고 검색·기록에선 찾아진다', () => {
  const profile = { primaryGoal: 'maintain' as const, secondaryGoals: [], diet: { type: 'balanced' as const, evidence: [], source: 'rule' as const } };
  const remaining = { kcal: 2579, carbs: 330, protein: 100, fat: 70, sugar: 50, sodium: 2000, emphasis: ['carbs', 'protein', 'fat'] as ('carbs' | 'protein' | 'fat')[] };

  it('GS25 두부·우유 팩·밀가루가 식재료·대용량으로 표시된다', () => {
    const flagged = new Map(getMenusByBrand('gs25').map((m) => [m.name, nonMealKind(m)]));
    expect(flagged.get('유어스 국산콩두부 찌개/부침겸용')).toBe('ingredient');
    expect(flagged.get('리얼프라이스 국산콩 왕두부')).toBe('ingredient');
    expect(flagged.get('유기농 우리밀 밀가루')).toBe('ingredient');
    expect(flagged.get('순백목장우유')).toBe('bulk');
    expect(flagged.get('1974 우유')).toBe('bulk');
    expect(flagged.get('리얼프라이스 김치볶음밥')).toBeNull();
  });

  it('식당·카페 메뉴는 거의 건드리지 않는다 (가공식품이 아닌 메뉴 중 표시된 것 1개 이하)', () => {
    const others = getMenus().filter((m) => !m.sourceName?.includes('가공식품') && nonMealKind(m));
    expect(others.length).toBeLessThanOrEqual(1);
  });

  it.each([
    ['12시', new Date(2026, 8, 15, 12)],
    ['21시 반', new Date(2026, 8, 15, 21, 30)],
  ])('편의점 매장 순위(%s)에 식재료·대용량이 없다', (_label, now) => {
    for (const b of ['gs25', 'cu', 'seven_eleven']) {
      const ranked = rankMenus(getMenusByBrand(b), remaining, { profile, now });
      expect(ranked.length).toBeGreaterThan(5);
      expect(ranked.every((x) => nonMealKind(x.menu) === null)).toBe(true);
    }
  });

  it('검색·목록·id 로는 그대로 찾아진다', () => {
    expect(searchMenus('국산콩두부', 100).some((m) => m.name === '유어스 국산콩두부 찌개/부침겸용')).toBe(true);
    expect(searchMenus('순백목장우유', 100).length).toBeGreaterThan(0);
    const tofu = getMenusByBrand('gs25').find((m) => m.name === '유어스 국산콩두부 찌개/부침겸용');
    expect(tofu && getMenu(tofu.id)).toBe(tofu);
  });
});

describe('drinkKey · mergeSeedOptionsIntoOfficial (순수 함수)', () => {
  it('사이즈·온도 표기와 공백을 빼고 온도를 따로 본다', () => {
    expect(drinkKey('카페 라떼 아이스(ICED) (Tall)')).toEqual({ base: '카페라떼', temp: 'ice' });
    expect(drinkKey('아이스 카페 라떼')).toEqual({ base: '카페라떼', temp: 'ice' });
    expect(drinkKey('카페라떼')).toEqual({ base: '카페라떼', temp: null });
    expect(drinkKey('카페 라떼 핫(HOT) (EX)')).toEqual({ base: '카페라떼', temp: 'hot' });
    expect(drinkKey('HOT 흑임자 크림 라떼')).toEqual({ base: '흑임자크림라떼', temp: 'hot' });
    expect(drinkKey('콜드 브루 (Tall)')).toEqual({ base: '콜드브루', temp: null });
    expect(drinkKey('카페 라떼 Grande')).toEqual({ base: '카페라떼', temp: null });
    // 이름의 일부인 아이스는 그대로
    expect(drinkKey('아이스크림 카페 라떼').base).toBe('아이스크림카페라떼');
    expect(drinkKey('복숭아 아이스티').base).toBe('복숭아아이스티');
    expect(normalizeName('카페 라떼')).toBe(drinkKey('카페 라떼 (Venti)').base);
  });

  const off = (id: string, name: string, kcal: number, brandId = 'cafe'): MenuItem => ({
    id,
    brandId,
    name,
    category: 'drink',
    serving: '1잔',
    nutrients: { kcal },
    trust: 'official',
    sourceUrl: 'https://example.com',
  });
  const seed: MenuItem = {
    id: 'cafe-iced-latte',
    brandId: 'cafe',
    name: '아이스 카페 라떼',
    category: 'drink',
    serving: 'Tall',
    nutrients: { kcal: 110 },
    trust: 'estimated',
    blurb: '부드러운 라떼예요.',
    options: [
      { id: 'size', label: '사이즈', choices: [{ label: 'Tall', delta: {}, isDefault: true }, { label: 'Venti', delta: { kcal: 70 } }] },
      { id: 'milk', label: '우유 변경', choices: [{ label: '일반', delta: {}, isDefault: true }, { label: '오트밀크', delta: { kcal: -10 } }] },
    ],
  };

  it('같은 브랜드·이름·온도의 공식판이 있으면 시드를 숨기고 사이즈 외 옵션·소개를 공식판마다 옮긴다', () => {
    const input = [seed, off('o-ice-t', '카페 라떼 아이스(ICED) (Tall)', 110), off('o-ice-v', '카페 라떼 아이스(ICED) (Venti)', 180), off('o-hot', '카페 라떼 핫(HOT) (Tall)', 180), off('x', '카페 라떼 아이스(ICED)', 1, 'other')];
    const r = mergeSeedOptionsIntoOfficial(input);
    expect(r.menus.map((m) => m.id)).toEqual(['o-ice-t', 'o-ice-v', 'o-hot', 'x']);
    expect(r.hidden.map((m) => m.id)).toEqual(['cafe-iced-latte']);
    expect(r.mergedByBrand).toEqual({ cafe: 1 });
    for (const id of ['o-ice-t', 'o-ice-v']) {
      const m = r.menus.find((x) => x.id === id)!;
      expect(m.options?.map((g) => g.id)).toEqual(['milk']);
      expect(m.blurb).toBe('부드러운 라떼예요.');
      expect(m.trust).toBe('official');
    }
    // 온도가 다른 공식판·다른 브랜드는 건드리지 않는다
    expect(r.menus.find((x) => x.id === 'o-hot')?.options).toBeUndefined();
    expect(r.menus.find((x) => x.id === 'x')?.options).toBeUndefined();
    // 입력은 바꾸지 않는다
    expect(input[1].options).toBeUndefined();
  });

  it('짝이 없으면 시드 옵션판을 그대로 둔다', () => {
    const r = mergeSeedOptionsIntoOfficial([seed, off('o-hot', '카페 라떼 핫(HOT) (Tall)', 180), off('o2', '바닐라 라떼 아이스(ICED)', 200)]);
    expect(r.hidden).toEqual([]);
    expect(r.menus[0]).toBe(seed);
  });
});

describe('searchMenus (기록 추가 E2)', () => {
  it('메뉴명·브랜드명 부분 일치, 대소문자·공백 무시, limit 에서 멈춘다', () => {
    expect(searchMenus('  ')).toEqual([]);
    const byName = searchMenus('아메리 카노', 1000);
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((m) => m.name.replace(/\s/g, '').includes('아메리카노') || getBrand(m.brandId)?.name.includes('아메리카노'))).toBe(true);
    expect(searchMenus('스타벅스', 5)).toHaveLength(5);
    expect(searchMenus('스타벅스', 5).every((m) => m.brandId === 'starbucks')).toBe(true);
  });

  it('목록 순서를 지키고 getMenus 필터와 결과가 같다', () => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
    const q = '라떼';
    const naive = getMenus().filter((m) => norm(m.name).includes(q) || norm(getBrand(m.brandId)?.name ?? '').includes(q)).slice(0, 40);
    expect(searchMenus(q).map((m) => m.id)).toEqual(naive.map((m) => m.id));
  });

  it('1만여 개에서 한 번 검색이 충분히 빠르다', () => {
    searchMenus('워밍업');
    const t = Date.now();
    for (let i = 0; i < 50; i++) searchMenus(`없는메뉴${i}`);
    expect((Date.now() - t) / 50).toBeLessThan(20);
  });
});

describe('matchBrand', () => {
  it.each([
    ['GS25 역삼센터점', 'gs25'],
    ['지에스25 강남점', 'gs25'],
    ['gs 25 선릉점', 'gs25'],
    ['스타벅스 역삼역점', 'starbucks'],
    ['STARBUCKS Gangnam', 'starbucks'],
    ['CU 역삼테헤란점', 'cu'],
    ['세븐일레븐 역삼스타점', 'seven_eleven'],
    ['7-Eleven 강남', 'seven_eleven'],
    ['메가MGC커피 역삼점', 'mega'],
    ['샐러디 강남점', 'salady'],
    ['본죽 역삼점', 'bonjuk'],
    ['맘스터치 역삼점', 'mom_touch'],
  ])('%s → %s', (name, id) => {
    expect(matchBrand(name)?.id).toBe(id);
  });
  it('모르는 매장은 undefined', () => {
    expect(matchBrand('김밥천국 역삼점')).toBeUndefined();
    expect(matchBrand('')).toBeUndefined();
  });
});

describe('getMockStores', () => {
  it('10곳, 거리순, 시안 4곳 포함, 거리는 haversine', () => {
    const stores = getMockStores(CENTER);
    expect(stores).toHaveLength(10);
    const byName = Object.fromEntries(stores.map((s) => [s.name, s]));
    expect(byName['GS25 역삼센터점']).toMatchObject({ distanceM: 120, category: 'convenience', coverage: 'full' });
    expect(byName['스타벅스 역삼역점']).toMatchObject({ distanceM: 180, category: 'cafe', coverage: 'full' });
    expect(byName['샐러디 강남점']).toMatchObject({ distanceM: 260, category: 'salad', coverage: 'partial' });
    expect(byName['본죽 역삼점']).toMatchObject({ distanceM: 420, category: 'korean', coverage: 'none' });
    for (let i = 1; i < stores.length; i++) expect(stores[i].distanceM).toBeGreaterThanOrEqual(stores[i - 1].distanceM);
    for (const s of stores) {
      expect(Math.abs(haversineM(CENTER, s) - s.distanceM)).toBeLessThan(1);
      expect(matchBrand(s.name)?.id).toBe(s.brandId);
    }
  });
});

describe('피자 한 판·홀케이크 → 1조각 기준 (perSlice)', () => {
  const profile = { primaryGoal: 'maintain' as const, secondaryGoals: [], diet: { type: 'balanced' as const, evidence: [], source: 'rule' as const } };

  it('공개 조각 수가 있는 브랜드(도미노·피자헛·파파존스)의 한 판 피자는 목록에 1조각으로만 있다', () => {
    const counts = getPerSliceCounts().slicedByBrand;
    for (const b of Object.keys(PIZZA_SLICES)) {
      expect(counts[b]).toBeGreaterThan(20);
      for (const m of getMenusByBrand(b)) {
        const size = pizzaSize(m.name);
        const n = size ? PIZZA_SLICES[b].sizes[size] : undefined;
        // 조각 수를 아는 사이즈인데 1인분(한 판) 그대로 남은 메뉴가 없다
        if (n && m.trust === 'official') expect(m.serving.startsWith('1인분 (')).toBe(false);
        if (m.id.endsWith(SLICE_ID_SUFFIX)) {
          expect(m.serving).toMatch(/^1조각 \(약 \d+ g\)$/);
          expect(menuQtyUnit(m)).toBe('조각');
          expect(m.servingNote).toBe(`한 판(${n}조각) 영양을 나눈 1조각 기준이에요`);
        }
      }
    }
  });

  it('도미노 리얼불고기 L: 한 판 값을 8로 나누고, 원래 한 판 메뉴는 id 로 그대로 찾힌다 (예전 기록)', () => {
    const slice = getMenusByBrand('dominos').find((m) => m.id.endsWith(SLICE_ID_SUFFIX) && /\(L\)$/.test(m.name));
    expect(slice).toBeDefined();
    const whole = getMenu(slice!.id.slice(0, -SLICE_ID_SUFFIX.length));
    expect(whole?.trust).toBe('official');
    expect(whole?.serving.startsWith('1인분 (')).toBe(true);
    expect(menuQtyUnit(whole)).toBe('인분');
    expect(slice!.nutrients!.kcal).toBe(Math.round(whole!.nutrients!.kcal / 8));
    expect(getMenusByBrand('dominos').some((m) => m.id === whole!.id)).toBe(false);
  });

  it('공식 "(조각)" 메뉴가 있는 홀케이크는 목록에서 빠지고 조각 메뉴가 남는다 (공식값 그대로)', () => {
    const counts = getPerSliceCounts().cakesByBrand;
    expect(counts.pascucci).toBeGreaterThanOrEqual(5);
    const pc = getMenusByBrand('pascucci');
    expect(pc.some((m) => m.name === '레드벨벳 케이크 (홀)')).toBe(false);
    expect(pc.find((m) => m.name === '레드벨벳 케이크 (조각)')?.trust).toBe('official');
    const sb = getMenusByBrand('starbucks');
    expect(sb.some((m) => m.name === '블루베리 쿠키 치즈 케이크')).toBe(false);
    expect(sb.some((m) => m.name === '블루베리 쿠키 치즈 케이크 (조각)')).toBe(true);
    // 조각 메뉴가 없는 홀케이크는 바꾸지 않는다
    expect(pc.some((m) => m.name === '초코 글레이즈 케이크 (홀)')).toBe(true);
  });

  it.each([
    ['12시', new Date(2026, 8, 15, 12)],
    ['19시', new Date(2026, 8, 15, 19)],
  ])('도미노 매장 순위(%s)에 좋음·괜찮음 1조각 피자가 올라온다', (_l, now) => {
    const remaining = { kcal: 1500, carbs: 200, protein: 70, fat: 50, sugar: 40, sodium: 1600, emphasis: ['carbs', 'protein', 'fat'] as ('carbs' | 'protein' | 'fat')[] };
    const top = rankMenus(getMenusByBrand('dominos'), remaining, { profile, now }).slice(0, 5);
    expect(top).toHaveLength(5);
    for (const x of top) {
      expect(x.judgement.verdict).not.toBe('pass');
      expect(x.menu.id.endsWith(SLICE_ID_SUFFIX)).toBe(true);
      expect(nonMealKind(x.menu)).toBeNull();
    }
  });
});

describe('perSlice 순수 함수', () => {
  const base = { brandId: 'dominos', category: 'meal' as const, trust: 'official' as const, sourceUrl: 'https://example.com' };
  it('pizzaSize: 끝의 (L)·(M)·" M"', () => {
    expect(pizzaSize('리얼불고기 피자 (L)')).toBe('L');
    expect(pizzaSize('씨푸드킹 피자 리치골드 M')).toBe('M');
    expect(pizzaSize('가든스페셜 피자 (P)')).toBe('P');
    expect(pizzaSize('맵퍼로니')).toBeNull();
    expect(pizzaSize('치즈 (L) 스틱')).toBeNull();
  });
  it('toSlice: 영양·중량·옵션 델타를 조각 수로 나누고 새 id·estimated·한 줄 설명', () => {
    const whole: MenuItem = {
      ...base,
      id: 'p1',
      name: '치즈 (L)',
      serving: '1인분 (849 g)',
      nutrients: { kcal: 2284, carbs: 250, protein: 112.8, fat: 90, sodium: 3061 },
      options: [{ id: 'crust', label: '엣지', choices: [{ label: '기본', delta: {}, isDefault: true }, { label: '치즈', delta: { kcal: 400, fat: 20 } }] }],
    };
    const s = toSlice(whole, 8);
    expect(s).toMatchObject({ id: 'p1-slice', serving: '1조각 (약 106 g)', trust: 'estimated', nutrients: { kcal: 286, carbs: 31.3, protein: 14.1, fat: 11.3, sodium: 383 } });
    expect(s.options?.[0].choices[1].delta).toEqual({ kcal: 50, fat: 2.5 });
    expect(whole.id).toBe('p1'); // 입력은 그대로
  });
  it('applyPerSlice: 모르는 브랜드·사이즈·100 g 기준 표기는 바꾸지 않는다', () => {
    const mk = (id: string, brandId: string, name: string, serving = '1인분 (900 g)'): MenuItem => ({ ...base, id, brandId, name, serving, nutrients: { kcal: 2000 } });
    const input = [mk('a', 'pizza7', '스페셜 (L)'), mk('b', 'pizza_hut', '크래프티드 플래츠 (P)'), mk('c', 'papa_johns', '가든 (F)', '100 g 기준'), mk('d', 'pizza_hut', '수퍼슈프림 (M)')];
    const r = applyPerSlice(input);
    expect(r.menus.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd-slice']);
    expect(r.menus[3].servingNote).toBe('한 판(6조각) 영양을 나눈 1조각 기준이에요');
    expect(r.hidden.map((m) => m.id)).toEqual(['d']);
  });
  it('cakeKey: 조각·홀·케이크·어순 공백 무시', () => {
    expect(cakeKey('뉴욕치즈 케이크 케이크 (조각)')).toBe(cakeKey('뉴욕치즈 케이크'));
    expect(cakeKey('레드벨벳 케이크 (홀)')).toBe(cakeKey('레드벨벳 케이크 (조각)'));
  });
});
