/**
 * 나눠 먹는 단위(피자 한 판·홀케이크)가 1인분으로 잡힌 공공데이터 메뉴를 "1조각 기준"으로 바꾼다 — 로드 단계 순수 변환.
 * (효님 결정 2026-09-25. 인제스트 결과 파일 mfds.json 은 그대로 두고 로더가 매번 같은 규칙으로 바꾼다)
 *
 * 숫자를 지어내지 않는다:
 * (a) 같은 브랜드에 공식 "(조각)" 메뉴가 있는 홀케이크 → 홀은 목록에서 빼고 조각 메뉴(공식값·trust 유지)를 쓴다.
 * (b) 1조각 값이 없는 피자 → 한 판 값을 브랜드가 공개한 사이즈별 조각 수로 나눈다. trust 'estimated' + servingNote 한 줄.
 *     조각 수는 아래 PIZZA_SLICES 에 출처와 함께 적은 것만 쓴다.
 * (c) 조각 수를 확인할 수 없는 브랜드·사이즈(지정환·피자마루·미스터피자·알볼로·피자파는집, 피자헛 P,
 *     사이즈 표기 없는 메뉴, 조각 메뉴가 없는 홀케이크)는 여기서 바꾸지 않고 perServing.ts 가 무게 기준으로 나눈다.
 *
 * 예전 기록(menuId)은 기록 당시 영양을 담고 있으므로, 원래 한 판·홀 메뉴는 hidden 으로 돌려줘 id 로 계속 찾히게 한다
 * (수량 단위도 예전 그대로 '인분'). 1조각 메뉴는 새 id `${원래 id}${SLICE_ID_SUFFIX}` 로 목록에 선다.
 */
import type { MenuItem, Nutrients } from '../domain/types';

export type PizzaSize = 'M' | 'L' | 'R' | 'F' | 'P';

export const SLICE_ID_SUFFIX = '-slice';

/** 브랜드가 공개한 사이즈별 조각 수 — 출처를 확인한 것만 (2026-09-25 확인) */
export const PIZZA_SLICES: Record<string, { sizes: Partial<Record<PizzaSize, number>>; source: string }> = {
  dominos: {
    sizes: { L: 8, M: 8 },
    // 도미노피자 공식 영양성분표: 라지·미디움 표 머리가 모두 "총8조각 중량(g)" (미디움은 1회분 = 2조각)
    source: 'http://cdn.dominos.co.kr/www_new/html/online/on_1.html',
  },
  pizza_hut: {
    sizes: { L: 8, M: 6 },
    // 피자헛 공식 영양성분표 "총 조각수" 열: 라지 8 · 미디엄 6 (P 는 조각 수 표기 없음 → 바꾸지 않음)
    source: 'https://www.pizzahut.co.kr/popup/popup_nutrition.do',
  },
  papa_johns: {
    sizes: { R: 6, L: 8, F: 8, P: 10 },
    // 파파존스 공식 Threads(@papajohnskr): "레귤러 6 라지 8 패밀리 8 파티 10" — 데이터의 (P)는 파티(가장 큰 사이즈)
    // 2026-09-25 공식 주문 페이지(https://pji.co.kr/menu/pizza/3241, L·F 판매 메뉴)에서 컷팅 옵션 "기본(8조각)" 확인 — L·F 8 교차 확인. R 6·P 10 은 Threads 만
    source: 'https://www.threads.com/@papajohnskr/post/DZkPdcdiVEH',
  },
  pizza7: {
    sizes: { R: 8, L: 8 },
    // 7번가피자 공식 메뉴 → 영양성분(popup.php?popSeq=…&popCate=2) 표: "1회 중량 · 1회 조각수 · 총 중량" 열
    // 예) 샘스테이크 L 석쇠 129 g × 8 ≈ 1,034 g, 샘스테이크 R 석쇠 2조각 170 g → 679 g ÷ 85 g = 8조각 (2026-09-26 확인)
    source: 'https://www.7thpizza.com/sub/menu/list.php',
  },
};

/** 이름 끝 사이즈 표기 "(L)" · "(M)" · "리치골드 M" → 사이즈 */
export function pizzaSize(name: string): PizzaSize | null {
  const m = name.normalize('NFKC').trim().match(/(?:\(\s*(M|L|R|F|P)\s*\)|\s(M|L))$/);
  return (m?.[1] ?? m?.[2] ?? null) as PizzaSize | null;
}

/** "1인분 (945 g)" → 945. 100 g 기준처럼 한 판 전체가 아닌 표기는 null */
function wholeGrams(serving: string): number | null {
  const m = serving.match(/^1인분\s*\((\d+(?:\.\d+)?)\s*g\)$/);
  return m ? Number(m[1]) : null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function divide(n: Nutrients, by: number): Nutrients {
  const out: Nutrients = { kcal: Math.round(n.kcal / by) };
  for (const k of ['carbs', 'protein', 'fat', 'satFat', 'sugar'] as const) {
    const v = n[k];
    if (typeof v === 'number') out[k] = round1(v / by);
  }
  for (const k of ['sodium', 'caffeine'] as const) {
    const v = n[k];
    if (typeof v === 'number') out[k] = Math.round(v / by);
  }
  return out;
}

/** 한 판 → 1조각 메뉴 (새 id). 옵션이 있으면 델타도 같은 조각 수로 나눈다 */
export function toSlice(menu: MenuItem, slices: number): MenuItem {
  const grams = wholeGrams(menu.serving);
  const out: MenuItem = {
    ...menu,
    id: `${menu.id}${SLICE_ID_SUFFIX}`,
    serving: grams ? `1조각 (약 ${Math.round(grams / slices)} g)` : '1조각',
    nutrients: menu.nutrients ? divide(menu.nutrients, slices) : null,
    trust: 'estimated',
    servingNote: `한 판(${slices}조각) 영양을 나눈 1조각 기준이에요`,
  };
  if (menu.options) {
    out.options = menu.options.map((g) => ({
      ...g,
      choices: g.choices.map((c) => {
        const delta: Partial<Nutrients> = {};
        for (const [k, v] of Object.entries(c.delta)) if (typeof v === 'number') delta[k as keyof Nutrients] = round1(v / slices);
        return { ...c, delta };
      }),
    }));
  }
  return out;
}

/** 케이크 이름 비교 키 — "(조각)"·"(홀)"·"케이크"·공백을 뺀다 ("밀키프로마쥬무스 케이크 딸기" = "밀키프로마쥬무스 딸기 케이크 (조각)") */
export function cakeKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\(\s*(?:조각|홀)\s*\)|조각/g, '')
    .replace(/케이크/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const isSliceName = (name: string) => /조각/.test(name);
const CAKE_RE = /케이크|타르트|파이/;

export interface PerSliceResult {
  menus: MenuItem[];
  /** 목록에서 빠진 원래 한 판·홀 메뉴 (id 조회용) */
  hidden: MenuItem[];
  /** 브랜드별 1조각으로 나눈 피자 수 */
  slicedByBrand: Record<string, number>;
  /** 브랜드별 조각 메뉴로 대신한 홀케이크 수 */
  cakesByBrand: Record<string, number>;
}

/** 목록 순서를 지키며 변환 (입력은 바꾸지 않는다) */
export function applyPerSlice(menus: MenuItem[]): PerSliceResult {
  // (a) 공식 조각 케이크 색인
  const sliceCakes = new Map<string, MenuItem>();
  for (const m of menus) {
    if (m.trust === 'official' && m.nutrients && isSliceName(m.name) && CAKE_RE.test(m.name)) sliceCakes.set(`${m.brandId}|${cakeKey(m.name)}`, m);
  }
  const hidden: MenuItem[] = [];
  const slicedByBrand: Record<string, number> = {};
  const cakesByBrand: Record<string, number> = {};
  const out: MenuItem[] = [];
  for (const m of menus) {
    // (a) 홀케이크 → 조각 메뉴가 대신한다 (조각보다 2배 넘게 무거운 것만 홀로 본다)
    if (m.trust === 'official' && m.nutrients && CAKE_RE.test(m.name) && !isSliceName(m.name)) {
      const slice = sliceCakes.get(`${m.brandId}|${cakeKey(m.name)}`);
      const g = wholeGrams(m.serving);
      const sg = slice ? wholeGrams(slice.serving) : null;
      if (slice && slice.nutrients && m.nutrients.kcal > slice.nutrients.kcal * 2 && (!g || !sg || g > sg * 2)) {
        hidden.push(m);
        cakesByBrand[m.brandId] = (cakesByBrand[m.brandId] ?? 0) + 1;
        continue;
      }
    }
    // (b) 피자 한 판 → 공개 조각 수로 나눈 1조각
    const rule = PIZZA_SLICES[m.brandId];
    const size = rule ? pizzaSize(m.name) : null;
    const slices = size ? rule?.sizes[size] : undefined;
    if (slices && m.trust === 'official' && m.nutrients && wholeGrams(m.serving)) {
      hidden.push(m);
      out.push(toSlice(m, slices));
      slicedByBrand[m.brandId] = (slicedByBrand[m.brandId] ?? 0) + 1;
      continue;
    }
    out.push(m);
  }
  return { menus: out, hidden, slicedByBrand, cakesByBrand };
}
