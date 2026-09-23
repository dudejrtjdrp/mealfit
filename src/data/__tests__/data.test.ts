import { haversineM } from '../../domain/geo';
import { judgeMenu } from '../../domain/judge';
import { getBrand, getBrands, getMenu, getMenus, getMenusByBrand, getMockStores, getSeedPolicy, matchBrand } from '../index';

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

  it('공공데이터 메뉴는 official · 데이터셋 출처 · 이름 있음', () => {
    for (const m of getMenus().filter((x) => x.sourceName?.startsWith('식약처'))) {
      expect(m.trust).toBe('official');
      expect(m.sourceUrl).toMatch(/^https:\/\/www\.data\.go\.kr\/data\/151000(70|66)\/standard\.do$/);
      expect(m.name.length).toBeGreaterThan(0);
    }
  });
});

describe('시드 정리 정책 (로더)', () => {
  it('공공데이터 official 20개 이상 브랜드는 시드 estimated 가 목록에 없고, id 로는 여전히 찾힌다', () => {
    const policy = getSeedPolicy();
    expect(policy.cutoff).toBe(20);
    for (const brandId of Object.keys(policy.excludedByBrand)) {
      const ms = getMenusByBrand(brandId);
      expect(ms.filter((m) => m.trust === 'official').length).toBeGreaterThanOrEqual(20);
      expect(ms.some((m) => m.trust === 'estimated')).toBe(false);
    }
    expect(policy.excluded + policy.kept).toBe((require('../menus.json') as unknown[]).length);
    if (policy.excludedByBrand.starbucks) {
      expect(getMenusByBrand('starbucks').some((m) => m.id === 'starbucks-iced-latte')).toBe(false);
      expect(getMenu('starbucks-iced-latte')?.trust).toBe('estimated'); // 예전 기록이 깨지지 않게
    }
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
