/**
 * 공공데이터(식약처 음식 DB) 메뉴의 "1인분"을 실제로 한 번 먹는 단위로 맞춘다 — 로드 단계 순수 변환 (2026-09-26).
 * perSlice.ts(공식 조각 수) → perPortion.ts(치킨 1마리) 다음에 돈다. mfds.json 은 그대로 두고 로더가 매번 같은 규칙으로 바꾼다.
 *
 * 문제: ① "100 g/ml 기준" 으로만 남은 600여 개 (베이글·조각 케이크·음료·아이스크림·피자 100 g 행) 를 "1" 로 기록하면 100 g 이 들어간다.
 *       ② 한 판 피자·홀케이크(800~1,700 g)가 "1인분" 이라 1개 기록에 2,000~4,700 kcal 이 들어간다.
 *
 * 숫자를 지어내지 않는다 — 규칙마다 근거를 servingNote 한 줄("~기준 추정이에요")로 밝히고 전부 trust 'estimated':
 * (1) 한 판 피자(조각 수 공개 없는 브랜드) → 1조각. 한 판 중량 ÷ PIZZA_SLICE_REF_G(공식 조각 수를 아는 브랜드 1조각 중앙값)
 * (2) 홀케이크(조각 메뉴 없음) → 1조각. 홀 중량 ÷ 같은 브랜드 공식 "(조각)" 케이크 무게 중앙값(없으면 전체 중앙값)
 * (3) "(N개입)" 묶음 → 1개 = 중량 ÷ N
 * (4) 100 g 기준 피자 행 → 1조각. 같은 브랜드·사이즈 1조각 무게 중앙값(없으면 PIZZA_SLICE_REF_G)
 * (5) 100 ml 기준 음료 중 사이즈 표기가 있고 브랜드 컵 용량을 아는 것(DRINK_CUPS) → 1잔
 * (6) 그 밖의 100 g/ml 기준 · 나눠 먹는 큰 빵(식빵·페스츄리) → 식약처 1회 섭취참고량(SERVING_REF, 식품유형별) 만큼
 *     편의점 우유 1.8 L·밀가루 같은 식재료·대용량 포장은 domain/nonMeal 이 추천에서 빼므로 여기서 바꾸지 않는다.
 * (7) 어느 근거도 없는 것은 바꾸지 않는다 ("100 g 기준" 그대로 — PER100_EXCEPTIONS 에 이유와 함께 적는다)
 *
 * 영양이 바뀌는 메뉴는 새 id(`-slice` · `-serving`)로 목록에 서고 원래 메뉴는 hidden 으로 돌려줘
 * 예전 기록(menuId)이 id 로 계속 찾힌다 (perSlice·perPortion 과 같은 방식).
 */
import type { MenuItem } from '../domain/types';
import { scaleNutrients } from './perPortion';
import { SLICE_ID_SUFFIX, pizzaSize, toSlice } from './perSlice';

export const SERVING_ID_SUFFIX = '-serving';

/** 식약처 「식품등의 표시기준」 [별표 3] 1회 섭취참고량 (2026-09-26 확인) */
export const MFDS_SERVING_REF_SOURCE = {
  rule: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000174009',
  table: 'https://www.law.go.kr/flDownload.do?flSeq=133523845&flNm=%5B%EB%B3%84%ED%91%9C+3%5D+1%ED%9A%8C+%EC%84%AD%EC%B7%A8%EC%B0%B8%EA%B3%A0%EB%9F%89',
} as const;

export type RefKind = 'bread' | 'pizza' | 'snack' | 'icecream' | 'riceCake' | 'burger' | 'rice' | 'soup' | 'fries' | 'meat' | 'egg' | 'milk' | 'coffee' | 'drink';

/**
 * [별표 3] 에서 옮긴 값 — 1 과자류·빵류·떡류(과자 기타 30 g · 빵류 피자 150 g · 빵류 그 밖 70 g · 떡류 100 g),
 * 2 빙과류(아이스크림류 100 ml 또는 해당 g), 9 음료류(커피 240 ml · 과채음료·탄산·혼합음료 200 ml),
 * 19 우유류(우유 200 ml), 16 서류가공품(감자튀김 40 g), 17 식육가공품(양념육·갈비가공품 100 g), 18 알가공품류(알가공품 50 g),
 * 23 즉석식품류(밥 210 g · 국·탕 250 ml(g) · 햄버거·샌드위치류 150 g)
 */
export const SERVING_REF: Record<RefKind, { label: string; amount: number }> = {
  bread: { label: '빵류', amount: 70 },
  pizza: { label: '피자', amount: 150 },
  snack: { label: '과자', amount: 30 },
  icecream: { label: '아이스크림류', amount: 100 },
  riceCake: { label: '떡류', amount: 100 },
  burger: { label: '햄버거·샌드위치류', amount: 150 },
  rice: { label: '밥', amount: 210 },
  soup: { label: '국·탕', amount: 250 },
  fries: { label: '감자튀김', amount: 40 },
  meat: { label: '양념육', amount: 100 },
  egg: { label: '알가공품', amount: 50 },
  milk: { label: '우유', amount: 200 },
  coffee: { label: '커피', amount: 240 },
  drink: { label: '음료류', amount: 200 },
};

/**
 * 이름 → 1회 섭취참고량 식품유형. 앞선 규칙이 이긴다 (찰떡 아이스크림은 떡이 아니라 아이스크림, 피자빵은 빵).
 * 어느 것에도 맞지 않으면 null (바꾸지 않는다)
 */
const REF_RULES: [RefKind, RegExp][] = [
  ['icecream', /아이스크림|젤라또|레디팩|블록팩|스틱바/],
  ['snack', /쿠키|크루키|카사바|칩스|포테이토칩/],
  ['bread', /피자빵|핫도그빵|조리빵/],
  ['pizza', /피자/],
  ['burger', /버거|샌드위치|토스트/],
  ['riceCake', /떡/],
  ['rice', /볶음밥|치밥|주먹밥/],
  ['soup', /탕$|국$/],
  ['fries', /감자튀김|웨지감자/],
  ['meat', /폭립|닭발/],
  ['egg', /달걀|계란/],
  [
    'bread',
    /빵|베이글|스콘|머핀|크루아상|크라상|도넛|카스텔라|번$|고로케|페이스트리|프레즐|마들렌|퀸아망|크럼블|꽈배기|치즈볼|바게트볼|수플레|케이크|타르트|파이|티라미수|크레이프|크로플|와플|롤$|슈$/,
  ],
];
const COFFEE_RE = /커피|라떼|아메리카노|콜드브루|에스프레소|모카|마끼아또|카푸치노/;

export function refKind(name: string, unit: 'g' | 'ml'): RefKind | null {
  const n = name.normalize('NFKC');
  for (const [kind, re] of REF_RULES) if (re.test(n)) return kind;
  if (unit === 'ml') return /우유$/.test(n) ? 'milk' : COFFEE_RE.test(n) ? 'coffee' : 'drink';
  return null;
}

/**
 * 브랜드 컵 용량 — 이름 끝 사이즈 표기 "(L)" 와 짝지어 1잔으로 바꾼다.
 * 더리터: 사이즈 ML 610 ml · L 1,000 ml(=1 L, 브랜드 이름의 유래). 공식 사이트가 이 환경에서 열리지 않아 메뉴 정리 글로 확인하고,
 * 그 글의 "카페라떼 아이스 L 216 kcal" 이 식약처 100 ml 당 21 kcal × 10 과 맞는 것으로 교차 확인 (2026-09-26)
 */
export const DRINK_CUPS: Record<string, { sizes: Record<string, number>; source: string }> = {
  the_liter: {
    sizes: { ML: 610, L: 1000 },
    source: 'https://innerfilled.com/entry/%EB%8D%94%EB%A6%AC%ED%84%B0-The-Liter-%EB%A9%94%EB%89%B4-%EA%B0%80%EA%B2%A9-%EC%B9%BC%EB%A1%9C%EB%A6%AC-%EB%8B%B9-%ED%95%A8%EB%9F%89-%EC%B4%9D%EC%A0%95%EB%A6%AC',
  },
};

/**
 * 조각 수를 공개하지 않은 피자의 1조각 무게 — 공식 조각 수를 아는 브랜드(도미노 L·M 8, 피자헛 L 8·M 6,
 * 파파존스 R 6·L 8·F 8·P 10, 7번가 R·L 8 — perSlice PIZZA_SLICES)의 한 판 중량 ÷ 조각 수, 1,301개 메뉴의 중앙값 102 g
 * (2026-09-26 카탈로그에서 계산 · 라지만 보면 115 g). portionQuality 테스트가 카탈로그 값과 어긋나지 않는지 확인한다.
 */
export const PIZZA_SLICE_REF_G = 102;

/** 피자 전문 브랜드 — 한 판 판별용 (사이드 메뉴는 PIZZA_SIDE_RE 로 뺀다) */
export const PIZZA_BRANDS = new Set(['dominos', 'pizza_hut', 'papa_johns', 'pizza7', 'mr_pizza', 'jijeonghwan', 'pizza_maru', 'alvolo', 'pizza_paneun']);
const PIZZA_SIDE_RE = /스파게티|파스타|떡볶이|마떡|윙|봉|텐더|볶음밥|리조또|그라탕|스틱|샐러드|치킨$|치킨\s*\(|조각\)/;
/** 피자 브랜드의 한 판 피자인가 — 이름에 "피자"가 있으면 피자(투움바파스타 피자·잠봉루꼴라피자), 없으면 사이드가 아닌 식사 */
function isPizzaName(m: MenuItem, name: string): boolean {
  if (!PIZZA_BRANDS.has(m.brandId)) return false;
  if (/피자/.test(name)) return !/조각\)|피자빵/.test(name);
  return m.category === 'meal' && !PIZZA_SIDE_RE.test(name);
}
/** 사이즈 표기: (L)·(R)·(M)·(XL)·(G)·(F)·(P) 또는 끝의 "R"·"L" ("허브포테이토씬R") */
export function pizzaSizeLoose(name: string): string | null {
  const n = name.normalize('NFKC').trim();
  const m = n.match(/\(\s*(XL|L|M|R|G|F|P)\s*\)$/) ?? n.match(/[가-힣](R|L)$/);
  return m ? m[1] : (pizzaSize(n) ?? null);
}
/** 이 중량 미만은 1인용(피자헛 P 크래프티드 플래츠 303~317 g 등)으로 보고 나누지 않는다 */
export const PIZZA_WHOLE_MIN_G = 350;

const CAKE_RE = /케이크|케익|타르트|파이|롤$|롤케이크|티라미수|크레이프|쉬폰|생크림|갸또|프레지에|레이어|\d호/;
/** 케이크 이름이 들어간 음료·빙수 (티라미수 라떼·블루베리케이크 빙수 …) 는 케이크가 아니다 */
const NOT_CAKE_RE = /(라떼|프라페|스무디|쉐이크|셰이크|에이드|음료)\s*(\(|$)|빙수|ICED|HOT|빵$|브레드|식빵/;
/** 이름에 케이크 단서가 없어도 홀케이크를 파는 베이커리 (파리바게뜨 "마이넘버원"·"초코반 딸기반") */
const BAKERY_BRANDS = new Set(['paris_baguette', 'tous_les_jours']);
const BIG_BREAD_RE = /빵|브레드|식빵|토스트|페스츄리|페이스트리|번$|베이글|바게뜨|바게트|롤$/;
/** 홀케이크로 보는 최소 중량·열량 — 카페 조각 케이크는 대부분 60~260 g, 쁘띠·미니 홀케이크가 300 g 부터 */
export const CAKE_WHOLE_MIN_G = 300;
export const CAKE_WHOLE_MIN_KCAL = 800;
/** 빵류 참고량으로 줄이는 큰 빵(식빵·페스츄리·뜯어먹는 빵) 기준 */
export const BIG_BREAD_MIN_G = 300;
export const BIG_BREAD_MIN_KCAL = 1000;

/**
 * 근거가 없어 "100 g 기준" 으로 남기는 메뉴 — `${brandId}|${name}`.
 * 치킨 부분육·사이드는 브랜드가 중량을 공개하지 않았고(BBQ·굽네 공식 사이트는 조리 전 1마리 중량만),
 * 식약처 1회 섭취참고량 표에도 튀긴 닭·조림·샐러드 항목이 없다. 교촌은 공식 조리 전 중량이 있는 것만 perPortion 에서 바꿨다.
 */
const NO_WEIGHT = '브랜드가 조리 후·조각 중량을 공개하지 않고, 1회 섭취참고량 표에도 튀긴 닭·해산물 튀김 항목이 없어요';
// perPortion (c) 와 같은 판단
const ODD_HALF = '100 g 당 열량이 같은 메뉴 1마리의 절반 수준이라 데이터 자체가 이상해요';
const UNKNOWN_KIND = '이름만으로 식품유형을 정할 수 없고 중량 공개도 없어요';
export const PER100_EXCEPTIONS: Record<string, string> = Object.fromEntries(
  (
    [
      // BBQ — 부분육·사이드 중량 비공개 (공식 사이트는 조리 전 1마리 "10호" 만)
      ['bbq', '닭다리살 스테이크 극한왕갈비맛 (1개)', NO_WEIGHT],
      ['bbq', '닭다리살 스테이크 통다리바비큐맛 (1개)', NO_WEIGHT],
      ['bbq', '롱치즈스틱 (1개)', NO_WEIGHT],
      ['bbq', '새우스틱 (2개)', NO_WEIGHT],
      ['bbq', '오징어튀김 (3개)', NO_WEIGHT],
      ['bbq', '타르타르 새우튀김 (5개)', NO_WEIGHT],
      ['bbq', '통새우 멘보샤 (5개)', NO_WEIGHT],
      ['bbq', '스모크 치킨', NO_WEIGHT],
      ['bbq', '자메이카 소떡만나 치킨', NO_WEIGHT],
      ['bbq', '자메이카 소떡만나 치킨 콤보', NO_WEIGHT],
      ['bbq', '자메이카 소떡만나치 킨 순살', NO_WEIGHT],
      ['bbq', '자메이카 통다리구이', NO_WEIGHT],
      ['bbq', '크런치 순살크래커 치킨', NO_WEIGHT],
      ['bbq', '크런치 올치팝', NO_WEIGHT],
      ['bbq', '파더’s 치킨', NO_WEIGHT],
      ['bbq', '황금올리브 치킨 속안심', NO_WEIGHT],
      ['bbq', '황금올리브 치킨 콤보', NO_WEIGHT],
      ['bbq', '황금올리브 치킨 핫윙', NO_WEIGHT],
      ['bbq', '황금올리브 치킨 핫윙 냉장', NO_WEIGHT],
      ['bbq', '황금올리브치킨 닭다리', NO_WEIGHT],
      ['bbq', '황올 반+양념 반 닭다리 치킨', NO_WEIGHT],
      ['bbq', '황올 반+양념 반 콤보 치킨', NO_WEIGHT],
      ['bbq', 'BBQ 닭껍데기', NO_WEIGHT],
      ['bbq', '오감볼', UNKNOWN_KIND],
      ['bbq', '매운양념 치킨 반마리', ODD_HALF],
      ['bbq', '스모크 치킨 반마리', ODD_HALF],
      ['bbq', '자메이카 통다리구이 반마리', ODD_HALF],
      ['bbq', '황금올리브 치킨 레드착착 반마리', ODD_HALF],
      // 교촌 — 공식 메뉴 페이지에 중량이 없는 윙(개수만 "20PCS")·단종 순살·세트·안주 (중량이 있는 순살은 perPortion 에서 바꿨다)
      ['kyochon', '교촌윙 치킨', NO_WEIGHT],
      ['kyochon', '교촌윙 치킨 (S)', NO_WEIGHT],
      ['kyochon', '레드윙 치킨', NO_WEIGHT],
      ['kyochon', '레드윙 치킨 (S)', NO_WEIGHT],
      ['kyochon', '반반윙 치킨', NO_WEIGHT],
      ['kyochon', '허니점보윙 치킨', NO_WEIGHT],
      ['kyochon', '블랙시크릿 순살 치킨', NO_WEIGHT],
      ['kyochon', '블랙시크릿 순살 치킨 (S)', NO_WEIGHT],
      ['kyochon', '살살후라이드 미니 치킨', '공식 조리 전 210 g 은 있지만 1마리·반마리 단위가 아니라 그대로 둬요'],
      ['kyochon', '시그니처순살 치킨 세트', NO_WEIGHT],
      ['kyochon', '아 귀한 먹태', UNKNOWN_KIND],
      ['kyochon', '샐러드', UNKNOWN_KIND],
      // 굽네 — 중량 비공개
      ['goobne', '오븐 바사삭 윙 치킨', NO_WEIGHT],
      ['goobne', '치킨마크니 찍먹커리', UNKNOWN_KIND],
      // 기타
      ['lotteria', '코울슬로', UNKNOWN_KIND],
      ['pizza_maru', '새우링(4조각)', NO_WEIGHT],
      ['twosome', '오리지널버터', UNKNOWN_KIND], // 버터바·쿠키·빵 중 무엇인지 이름으로 알 수 없음
    ] as const
  ).map(([b, n, why]) => [`${b}|${n}`, why]),
);

const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** "1인분 (945 g)" → 945 */
function wholeGrams(serving: string): number | null {
  const m = serving.match(/^1인분\s*\((\d+(?:\.\d+)?)\s*g\)$/);
  return m ? Number(m[1]) : null;
}
/** "100 g 기준" · "100 ml 기준" → 단위 */
export function per100Basis(serving: string): 'g' | 'ml' | null {
  const m = serving.match(/^100 (g|ml) 기준$/);
  return m ? (m[1] as 'g' | 'ml') : null;
}
/** "1조각 (약 100 g)" → 100 */
function sliceGrams(serving: string): number | null {
  const m = serving.match(/^1조각 \(약 (\d+) g\)$/);
  return m ? Number(m[1]) : null;
}

const isMfds = (m: MenuItem) => m.id.includes('-mfds-');
const push = (map: Map<string, number[]>, k: string, v: number) => {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
};

/** 100 g(ml) 값 → amount g(ml) 짜리 새 메뉴 (새 id, estimated) */
function scaled(menu: MenuItem, amount: number, serving: string, note: string): MenuItem {
  return {
    ...menu,
    id: `${menu.id}${SERVING_ID_SUFFIX}`,
    serving,
    nutrients: menu.nutrients ? scaleNutrients(menu.nutrients, amount / 100) : null,
    trust: 'estimated',
    servingNote: note,
  };
}

/** 한 판·홀 → 1조각 (perSlice.toSlice 로 나누고, 근거 한 줄만 바꾼다) */
function sliceBy(menu: MenuItem, slices: number, note: string): MenuItem {
  return { ...toSlice(menu, slices), servingNote: note };
}

/** 1회 섭취참고량 만큼 (100 g 기준 행 → amount/100 배, 1인분 (N g) 행 → amount/N 배) */
export function toServingRef(menu: MenuItem, kind: RefKind, unit: 'g' | 'ml', fromGrams = 100): MenuItem {
  const ref = SERVING_REF[kind];
  return scaled(menu, (ref.amount / fromGrams) * 100, `1회 섭취참고량 (${ref.amount} ${unit})`, `식약처 1회 섭취참고량(${ref.label} ${ref.amount} ${unit}) 기준 추정이에요`);
}

export type ServingRule = 'pizzaWhole' | 'cakeWhole' | 'multiPack' | 'pizza100' | 'cup' | 'ref' | 'bigPack';

export interface PerServingResult {
  menus: MenuItem[];
  /** 목록에서 빠진 원래 메뉴 (id 조회용) */
  hidden: MenuItem[];
  /** 규칙별 바꾼 메뉴 수 */
  byRule: Record<ServingRule, number>;
  /** 브랜드별 바꾼 메뉴 수 */
  byBrand: Record<string, number>;
}

/** 목록 순서를 지키며 변환 (입력은 바꾸지 않는다) */
export function applyPerServing(menus: MenuItem[]): PerServingResult {
  // 브랜드 공식 "(조각)" 케이크 무게 — 홀케이크를 나눌 1조각 무게
  const cakeSlices = new Map<string, number[]>();
  const allCakeSlices: number[] = [];
  // 브랜드·사이즈별 1조각 무게 (perSlice 가 공식 조각 수로 나눈 것) — 100 g 기준 피자 행용
  const pizzaSlices = new Map<string, number[]>();
  for (const m of menus) {
    const g = wholeGrams(m.serving);
    if (g && m.trust === 'official' && /조각/.test(m.name) && CAKE_RE.test(m.name.replace(/\s*\(\s*조각\s*\)\s*$/, ''))) {
      push(cakeSlices, m.brandId, g);
      allCakeSlices.push(g);
    }
    const sg = m.id.endsWith(SLICE_ID_SUFFIX) ? sliceGrams(m.serving) : null;
    if (sg) {
      const size = pizzaSizeLoose(m.name) ?? '';
      push(pizzaSlices, `${m.brandId}|${size}`, sg);
      push(pizzaSlices, `${m.brandId}|`, sg);
    }
  }
  const cakeSliceG = (brandId: string) => {
    const own = cakeSlices.get(brandId);
    return { g: Math.round(median(own && own.length >= 3 ? own : allCakeSlices.length ? allCakeSlices : [120])), own: !!own && own.length >= 3 };
  };

  const hidden: MenuItem[] = [];
  const byRule = { pizzaWhole: 0, cakeWhole: 0, multiPack: 0, pizza100: 0, cup: 0, ref: 0, bigPack: 0 } as Record<ServingRule, number>;
  const byBrand: Record<string, number> = {};
  const out: MenuItem[] = [];
  const done = (orig: MenuItem, next: MenuItem, rule: ServingRule) => {
    hidden.push(orig);
    out.push(next);
    byRule[rule]++;
    byBrand[orig.brandId] = (byBrand[orig.brandId] ?? 0) + 1;
  };

  for (const m of menus) {
    if (!isMfds(m) || !m.nutrients || m.id.endsWith(SLICE_ID_SUFFIX)) {
      out.push(m);
      continue;
    }
    const whole = wholeGrams(m.serving);
    const basis = per100Basis(m.serving);
    // 대부분(1인분 300 g 미만 단품)은 여기서 끝 — 카탈로그 로드 시간을 아낀다
    if (!basis && !(whole && (whole >= CAKE_WHOLE_MIN_G || PIZZA_BRANDS.has(m.brandId) || m.name.includes('개입')))) {
      out.push(m);
      continue;
    }
    const name = m.name.normalize('NFKC');

    if (whole) {
      // (3) N개입 → 1개
      const pack = name.match(/\((\d+)\s*개입\)/);
      if (pack && Number(pack[1]) > 1) {
        const n = Number(pack[1]);
        const g = whole / n;
        const next: MenuItem = {
          ...m,
          id: `${m.id}${SERVING_ID_SUFFIX}`,
          serving: `1개 (약 ${fmtNum(g)} g)`,
          nutrients: scaleNutrients(m.nutrients, 1 / n),
          trust: 'estimated',
          servingNote: `${n}개입(${fmtNum(whole)} g)을 1개로 나눈 추정이에요`,
        };
        done(m, next, 'multiPack');
        continue;
      }
      // (1) 한 판 피자 → 1조각
      const size = pizzaSizeLoose(name);
      if (isPizzaName(m, name) && (whole >= PIZZA_WHOLE_MIN_G || (size && size !== 'P'))) {
        const n = Math.max(2, Math.round(whole / PIZZA_SLICE_REF_G));
        done(m, sliceBy(m, n, `조각 수 공개가 없어 한 판(${fmtNum(whole)} g)을 피자 1조각 평균(약 ${PIZZA_SLICE_REF_G} g)으로 나눈 ${n}조각 중 1조각 추정이에요`), 'pizzaWhole');
        continue;
      }
      // (2) 홀케이크 → 1조각
      const big = !PIZZA_BRANDS.has(m.brandId) && !/조각/.test(name) && !NOT_CAKE_RE.test(name);
      const bakeryCake = BAKERY_BRANDS.has(m.brandId) && m.category === 'snack' && !BIG_BREAD_RE.test(name);
      if (big && (CAKE_RE.test(name) || bakeryCake) && whole >= CAKE_WHOLE_MIN_G && m.nutrients.kcal >= CAKE_WHOLE_MIN_KCAL) {
        const { g, own } = cakeSliceG(m.brandId);
        const n = Math.max(2, Math.round(whole / g));
        done(m, sliceBy(m, n, `홀(${fmtNum(whole)} g)을 ${own ? '이 브랜드' : '카페'} 조각 케이크 평균(약 ${g} g)으로 나눈 ${n}조각 중 1조각 추정이에요`), 'cakeWhole');
        continue;
      }
      // (6') 식빵·페스츄리처럼 나눠 먹는 큰 빵 → 빵류 1회 섭취참고량
      if (!PIZZA_BRANDS.has(m.brandId) && BIG_BREAD_RE.test(name) && whole >= BIG_BREAD_MIN_G && m.nutrients.kcal >= BIG_BREAD_MIN_KCAL) {
        const next = toServingRef(m, 'bread', 'g', whole);
        next.servingNote = `전체 ${fmtNum(whole)} g 제품 · ${next.servingNote}`;
        done(m, next, 'bigPack');
        continue;
      }
      out.push(m);
      continue;
    }

    if (basis) {
      // (4) 100 g 기준 피자 행 → 같은 브랜드·사이즈 1조각 무게
      if (basis === 'g' && isPizzaName(m, name)) {
        const size = pizzaSizeLoose(name) ?? '';
        const same = pizzaSlices.get(`${m.brandId}|${size}`) ?? (size ? undefined : pizzaSlices.get(`${m.brandId}|`));
        const g = same ? Math.round(median(same)) : PIZZA_SLICE_REF_G;
        const note = same ? `같은 브랜드 ${size ? `${size} 사이즈 ` : ''}피자 1조각 평균 무게(약 ${g} g)로 계산한 추정이에요` : `조각 무게 공개가 없어 피자 1조각 평균(약 ${g} g)으로 계산한 추정이에요`;
        done(m, scaled(m, g, `1조각 (약 ${g} g)`, note), 'pizza100');
        continue;
      }
      // (5) 사이즈 표기 음료 → 브랜드 컵 용량
      const cup = DRINK_CUPS[m.brandId];
      const cupSize = cup ? name.match(/\(\s*(ML|L|M|R)\s*\)$/)?.[1] : undefined;
      if (basis === 'ml' && cup && cupSize && cup.sizes[cupSize]) {
        const ml = cup.sizes[cupSize];
        done(m, scaled(m, ml, `1잔 · ${cupSize} (${ml} ml)`, `브랜드 ${cupSize} 컵(${fmtNum(ml)} ml) 기준 추정이에요`), 'cup');
        continue;
      }
      // (6) 식약처 1회 섭취참고량
      const kind = PER100_EXCEPTIONS[`${m.brandId}|${m.name}`] ? null : refKind(name, basis);
      if (kind) {
        done(m, toServingRef(m, kind, basis), 'ref');
        continue;
      }
    }
    out.push(m);
  }
  return { menus: out, hidden, byRule, byBrand };
}
