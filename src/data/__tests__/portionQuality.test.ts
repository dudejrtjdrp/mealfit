/**
 * "1인분" 데이터 품질 — 목록의 모든 메뉴가 실제로 한 번 먹는 단위인지 (2026-09-26 효님: 치킨 말고도 1인분 숫자가 틀린 게 많다).
 * perSlice(공식 조각 수) → perPortion(치킨 1마리) → perServing(1조각·1잔·1회 섭취참고량) 을 거친 카탈로그 전체를 본다.
 */
import { nonMealKind } from '../../domain/judge';
import { menuQtyUnit } from '../../domain/qty';
import type { MenuItem } from '../../domain/types';
import { getMenu, getMenus, getMenusByBrand, getPerServingCounts } from '../index';
import { PORTION_ID_SUFFIX } from '../perPortion';
import {
  applyPerServing,
  DRINK_CUPS,
  PER100_EXCEPTIONS,
  PIZZA_SLICE_REF_G,
  pizzaSizeLoose,
  refKind,
  SERVING_ID_SUFFIX,
  SERVING_REF,
} from '../perServing';
import { PIZZA_SLICES, SLICE_ID_SUFFIX } from '../perSlice';

/** 1회(1인분·1개·1잔·1조각·1회분)로 기록할 때 넘으면 안 되는 열량 */
const KCAL_CAP = 2000;
/** 나눠 먹는 단위라 상한을 넘어도 되는 제공량 — 치킨 1마리·반마리 (소비자원 실측 중량 기반, perPortion) */
const SHARING_SERVING_RE = /^(1마리|반마리) /;
/**
 * 이 변경 전부터 id 로 찾히지 않던 공공데이터 메뉴 — mergeMenus/dedupe 단계에서 빠진다(이번 변환과 무관).
 * 새로 늘어나면 예전 기록이 깨진 것이므로 테스트가 잡는다.
 */
const KNOWN_UNRESOLVED_IDS = new Set(['mega-mfds-d220-737000000-1271']);

const isMfds = (m: MenuItem) => !!m.sourceName?.startsWith('식약처');
const byName = (brandId: string, name: string) => getMenusByBrand(brandId).find((m) => m.name === name);
const baseId = (id: string) => id.replace(new RegExp(`(${SLICE_ID_SUFFIX}|${SERVING_ID_SUFFIX}|${PORTION_ID_SUFFIX})$`), '');

describe('1인분 품질 — 목록 전체', () => {
  it('"100 g/ml 기준" 으로 남은 메뉴는 근거가 없어 이유를 적어 둔 예외뿐이고, 예외 표에 없는 메뉴가 없다', () => {
    const left = getMenus().filter((m) => / 기준$/.test(m.serving));
    const keys = left.map((m) => `${m.brandId}|${m.name}`);
    expect(keys.filter((k) => !PER100_EXCEPTIONS[k])).toEqual([]);
    // 예외 표에 적었는데 이제 없는(이름이 바뀐) 메뉴가 없다 — 오래된 예외가 쌓이지 않게
    expect(Object.keys(PER100_EXCEPTIONS).filter((k) => !keys.includes(k))).toEqual([]);
    // 치킨 부분육·사이드 몇십 개 — 600여 개에서 줄었다
    expect(left.length).toBeLessThanOrEqual(50);
    for (const why of Object.values(PER100_EXCEPTIONS)) expect(why).toMatch(/요$/);
  });

  it(`1회 기록 단위가 ${KCAL_CAP.toLocaleString()} kcal 을 넘는 메뉴는 치킨 1마리·반마리와 식재료·대용량 포장뿐이다`, () => {
    const over = getMenus().filter((m) => (m.nutrients?.kcal ?? 0) > KCAL_CAP);
    const unexpected = over.filter((m) => !SHARING_SERVING_RE.test(m.serving) && nonMealKind(m) === null);
    expect(unexpected.map((m) => `${m.brandId} ${m.name} ${m.serving} ${m.nutrients!.kcal}`)).toEqual([]);
    // 허용한 것은 실제로 치킨 브랜드의 1마리이거나 추천에서 빠지는 식재료·대용량 (밀가루 600 g 등)
    for (const m of over) {
      if (SHARING_SERVING_RE.test(m.serving)) expect(['bbq', 'kyochon', 'goobne']).toContain(m.brandId);
      else expect(['ingredient', 'bulk']).toContain(nonMealKind(m));
    }
  });

  it('1조각·1회 섭취참고량·1잔·1개 는 한 번 먹는 양다운 크기다 (1조각 ≤ 700 kcal, 1회 섭취참고량 ≤ 700 kcal, 1잔 ≤ 1,100 kcal)', () => {
    for (const m of getMenus()) {
      const k = m.nutrients?.kcal ?? 0;
      if (m.serving.startsWith('1조각')) expect({ m: m.name, k }).toEqual({ m: m.name, k: Math.min(k, 700) });
      if (m.serving.startsWith('1회 섭취참고량')) expect({ m: m.name, k }).toEqual({ m: m.name, k: Math.min(k, 700) });
      if (m.serving.startsWith('1잔')) expect({ m: m.name, k }).toEqual({ m: m.name, k: Math.min(k, 1100) });
    }
  });

  it('공공데이터에서 환산한 메뉴는 전부 estimated + "~요" 한 줄 근거, 공식 메뉴는 출처가 있다', () => {
    for (const m of getMenus().filter(isMfds)) {
      if (m.trust === 'estimated') {
        expect(m.servingNote).toBeTruthy();
        expect(m.servingNote).toMatch(/요\.?$/);
      }
      if (m.id.endsWith(SERVING_ID_SUFFIX) || m.id.endsWith(SLICE_ID_SUFFIX) || m.id.endsWith(PORTION_ID_SUFFIX)) expect(m.trust).toBe('estimated');
      if (m.trust === 'official') expect(m.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('수량 단위가 제공량과 맞는다 (1조각 → 조각, 1잔 → 잔, 1개 → 개, 1회 섭취참고량 → 회분)', () => {
    for (const m of getMenus()) {
      if (m.serving.startsWith('1조각')) expect(menuQtyUnit(m)).toBe('조각');
      if (m.serving.startsWith('1잔')) expect(menuQtyUnit(m)).toBe('잔');
      if (m.serving.startsWith('1회 섭취참고량')) expect(menuQtyUnit(m)).toBe('회분');
      if (m.id.endsWith(SERVING_ID_SUFFIX) && m.serving.startsWith('1개')) expect(menuQtyUnit(m)).toBe('개');
    }
  });

  it('예전 기록이 깨지지 않는다 — 공공데이터 원래 id 는 모두 getMenu 로 찾히고, 바뀐 메뉴의 원래 id 는 옛 제공량 그대로다', () => {
    const mfds = (require('../generated/mfds.json') as { menus: MenuItem[] }).menus;
    const missing = mfds.filter((m) => !getMenu(m.id) && !KNOWN_UNRESOLVED_IDS.has(m.id)).map((m) => m.id);
    expect(missing).toEqual([]);
    const listed = new Set(getMenus().map((m) => m.id));
    for (const m of getMenus().filter((x) => x.id.endsWith(SERVING_ID_SUFFIX))) {
      const old = getMenu(baseId(m.id));
      expect(old).toBeDefined();
      expect(listed.has(old!.id)).toBe(false); // 목록에는 새 메뉴만
      expect(old!.serving).not.toBe(m.serving);
    }
  });

  it(`무게로 나누는 피자 1조각 기준(${PIZZA_SLICE_REF_G} g)은 공식 조각 수를 아는 브랜드 1조각 무게 중앙값과 5% 안에서 맞는다`, () => {
    const grams: number[] = [];
    for (const b of Object.keys(PIZZA_SLICES))
      for (const m of getMenusByBrand(b)) {
        const g = m.id.endsWith(SLICE_ID_SUFFIX) && m.servingNote?.startsWith('한 판(') ? m.serving.match(/^1조각 \(약 (\d+) g\)$/)?.[1] : undefined;
        if (g) grams.push(Number(g));
      }
    grams.sort((a, b) => a - b);
    const med = grams[grams.length >> 1];
    expect(grams.length).toBeGreaterThan(1000);
    expect(Math.abs(med / PIZZA_SLICE_REF_G - 1)).toBeLessThanOrEqual(0.05);
  });

  it('규칙별로 실제로 바뀐 메뉴가 있다 (규칙이 조용히 죽지 않게)', () => {
    const c = getPerServingCounts();
    expect(c.byRule.pizzaWhole).toBeGreaterThan(900);
    expect(c.byRule.pizza100).toBeGreaterThan(300);
    expect(c.byRule.cakeWhole).toBeGreaterThan(100);
    expect(c.byRule.cup).toBe(52);
    expect(c.byRule.ref).toBeGreaterThan(150);
    expect(c.byRule.multiPack).toBeGreaterThan(20);
    expect(c.byRule.bigPack).toBeGreaterThan(5);
  });
});

describe('1인분 품질 — 대표 메뉴 전후', () => {
  it('파파존스 100 g 기준 피자 → 같은 브랜드·사이즈 1조각 무게 (가든 스페셜 (F) 214 kcal/100 g → 1조각 약 117 g)', () => {
    const m = byName('papa_johns', '가든 스페셜 (F)')!;
    expect(m.serving).toBe('1조각 (약 117 g)');
    expect(m.nutrients!.kcal).toBe(Math.round(214 * 1.17));
    expect(getMenu(baseId(m.id))!.serving).toBe('100 g 기준');
  });

  it('더리터 L 음료 → 1잔 1,000 ml (카페 라떼 아이스 21 kcal/100 ml → 210 kcal, 메뉴 정리 글의 216 kcal 과 맞음)', () => {
    const m = byName('the_liter', '카페 라떼 아이스(ICED) (L)')!;
    expect(m.serving).toBe('1잔 · L (1000 ml)');
    expect(m.nutrients!.kcal).toBe(210);
    expect(DRINK_CUPS.the_liter.sizes.L).toBe(1000);
    expect(menuQtyUnit(m)).toBe('잔');
  });

  it('스타벅스 리얼 블루베리 베이글 → 식약처 1회 섭취참고량 빵류 70 g', () => {
    const m = byName('starbucks', '리얼 블루베리 베이글')!;
    expect(m).toMatchObject({ serving: '1회 섭취참고량 (70 g)', trust: 'estimated', servingNote: '식약처 1회 섭취참고량(빵류 70 g) 기준 추정이에요' });
    expect(m.nutrients!.kcal).toBe(Math.round(261 * 0.7));
  });

  it('파리바게뜨 3호 홀케이크 → 이 브랜드 조각 케이크 평균 무게로 나눈 1조각', () => {
    const m = byName('paris_baguette', '우유듬뿍생크림 케이크(선샤인) 3호')!;
    expect(m.id.endsWith(SLICE_ID_SUFFIX)).toBe(true);
    expect(m.serving).toMatch(/^1조각 \(약 \d+ g\)$/);
    expect(m.servingNote).toMatch(/^홀\(960 g\)을 이 브랜드 조각 케이크 평균\(약 \d+ g\)으로 나눈 \d+조각 중 1조각 추정이에요$/);
    expect(m.nutrients!.kcal).toBeLessThan(300);
    expect(getMenu(baseId(m.id))!.nutrients!.kcal).toBe(2544);
  });

  it('미스터피자 L 한 판 → 무게 기준 1조각, 100 g 기준 L 행 → 1조각 약 102 g', () => {
    const whole = byName('mr_pizza', '딜라이트치킨볼 피자 노엣지 (L)')!;
    expect(whole.serving).toBe('1조각 (약 104 g)');
    expect(whole.servingNote).toBe('조각 수 공개가 없어 한 판(932 g)을 피자 1조각 평균(약 102 g)으로 나눈 9조각 중 1조각 추정이에요');
    const per100 = byName('mr_pizza', '딜라이트치킨볼 피자 골드 (L)')!;
    expect(per100.serving).toBe(`1조각 (약 ${PIZZA_SLICE_REF_G} g)`);
    expect(per100.nutrients!.kcal).toBe(Math.round(265 * 1.02));
  });

  it('7번가피자는 공식 영양표의 조각 수(R·L 8조각)로 나눈다', () => {
    const m = byName('pizza7', '7번가스페셜 피자 석쇠 (L)')!;
    expect(m.serving).toBe('1조각 (약 127 g)'); // 공식 표 "1회 중량 127 g · 총 1,016 g"
    expect(m.servingNote).toBe('한 판(8조각) 영양을 나눈 1조각 기준이에요');
  });

  it('교촌 순살 → 공식 조리 전 700 g × 조리 전후 비율 (1마리), (S) 350 g (반마리)', () => {
    const m = byName('kyochon', '교촌순살 치킨')!;
    expect(m.serving).toBe('1마리 (약 463 g)');
    expect(m.nutrients!.kcal).toBe(Math.round(395 * 4.63));
    expect(byName('kyochon', '교촌순살 치킨 (S)')!.serving).toBe('반마리 (약 232 g)');
  });

  it('배스킨 레디팩(474 ml 한 통) → 식약처 1회 섭취참고량 아이스크림류 100 g', () => {
    const m = byName('baskin', '끼리크림치즈앤스트로베리 아이스크림 레디팩')!;
    expect(m).toMatchObject({ serving: '1회 섭취참고량 (100 g)', trust: 'estimated' });
    expect(m.nutrients!.kcal).toBe(216);
  });

  it('N개입 묶음 → 1개', () => {
    const m = byName('paris_baguette', '강원도알감자빵 (5개입)')!;
    expect(m.serving).toBe('1개 (약 32 g)');
    expect(m.nutrients!.kcal).toBe(78);
    expect(menuQtyUnit(m)).toBe('개');
  });
});

describe('perServing 순수 함수', () => {
  const base = { category: 'meal' as const, trust: 'official' as const, sourceUrl: 'https://www.data.go.kr/data/15100070/standard.do' };
  it('refKind: 앞선 규칙이 이긴다 (찰떡 아이스크림은 아이스크림, 피자빵은 빵), 모르는 g 는 null, ml 는 커피·음료', () => {
    expect(refKind('찰떡꽁떡 아이스크림', 'g')).toBe('icecream');
    expect(refKind('쫄깃한피자빵', 'g')).toBe('bread');
    expect(refKind('허니 고르곤졸라 스퀘어 피자', 'g')).toBe('pizza');
    expect(refKind('크리미치즈 그레인 쿠키', 'g')).toBe('snack');
    expect(refKind('닭갈비 볶음밥', 'g')).toBe('rice');
    expect(refKind('츠쿠네 어묵탕', 'g')).toBe('soup');
    expect(refKind('황금올리브 치킨 콤보', 'g')).toBeNull();
    expect(refKind('뽕소다 스무디', 'ml')).toBe('drink');
    expect(refKind('콜드브루 라떼', 'ml')).toBe('coffee');
    expect(SERVING_REF.bread.amount).toBe(70);
  });
  it('pizzaSizeLoose: (L)·(XL)·(G)·끝의 R', () => {
    expect(pizzaSizeLoose('고구마피자 (XL)')).toBe('XL');
    expect(pizzaSizeLoose('불고기 피자 석쇠 (G)')).toBe('G');
    expect(pizzaSizeLoose('허브포테이토씬R')).toBe('R');
    expect(pizzaSizeLoose('맵퍼로니')).toBeNull();
  });
  it('applyPerServing: 시드·작은 단품은 그대로, 한 판·홀·100 g 기준·개입만 바꾸고 원래 메뉴는 hidden', () => {
    const mk = (id: string, brandId: string, name: string, serving: string, kcal: number, category: MenuItem['category'] = 'meal'): MenuItem => ({
      ...base,
      id,
      brandId,
      name,
      serving,
      category,
      nutrients: { kcal },
    });
    const input = [
      mk('seed-1', 'alvolo', '고구마피자 (L)', '1인분 (985 g)', 2472), // 시드(공공데이터 아님)
      mk('alvolo-mfds-a', 'alvolo', '고구마피자 (L)', '1인분 (985 g)', 2472),
      mk('alvolo-mfds-b', 'alvolo', '까르보나라스파게티', '1인분 (472 g)', 854),
      mk('ediya-mfds-c', 'ediya', '블루베리 베이글', '100 g 기준', 280, 'snack'),
      mk('ediya-mfds-d', 'ediya', '아메리카노', '1인분 (355 ml)', 10, 'drink'),
      mk('pb-mfds-e', 'paris_baguette', '달달연유롤빵 (3개입)', '1인분 (138 g)', 551, 'snack'),
      mk('bbq-mfds-f', 'bbq', '황금올리브 치킨 콤보', '100 g 기준', 288),
    ];
    const r = applyPerServing(input);
    expect(r.menus.map((m) => [m.id, m.serving, m.nutrients?.kcal])).toEqual([
      ['seed-1', '1인분 (985 g)', 2472],
      ['alvolo-mfds-a-slice', '1조각 (약 99 g)', 247],
      ['alvolo-mfds-b', '1인분 (472 g)', 854],
      ['ediya-mfds-c-serving', '1회 섭취참고량 (70 g)', 196],
      ['ediya-mfds-d', '1인분 (355 ml)', 10],
      ['pb-mfds-e-serving', '1개 (약 46 g)', 184],
      ['bbq-mfds-f', '100 g 기준', 288],
    ]);
    expect(r.hidden.map((m) => m.id)).toEqual(['alvolo-mfds-a', 'ediya-mfds-c', 'pb-mfds-e']);
    expect(r.byRule).toMatchObject({ pizzaWhole: 1, ref: 1, multiPack: 1 });
    expect(input[1].serving).toBe('1인분 (985 g)'); // 입력은 그대로
  });
});
