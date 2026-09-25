/**
 * 식약처 음식 DB 의 치킨·카페 메뉴 중 "100 g 당" 값인데 "1인분 (100 g)" 으로 잡힌 것을 바로잡는다 — 로드 단계 순수 변환.
 * (2026-09-26. 인제스트 결과 mfds.json 은 그대로 두고 로더가 매번 같은 규칙으로 바꾼다. perSlice.ts 와 같은 방식)
 *
 * 예: BBQ 황금올리브 치킨 254 kcal "1인분 (100 g)" → "1마리 1개 = 254 kcal" 로 기록되던 문제.
 *
 * 숫자를 지어내지 않는다:
 * (a) 1마리 중량을 아는(또는 출처 있는 기본값으로 정한) 치킨 → 100 g 값 × 중량/100 으로 "1마리 (…g)" 메뉴를 새 id 로 만든다.
 *     중량은 아래 CHICKEN_PORTIONS 에 출처와 함께 적은 것만 쓴다. 브랜드는 조리 후 1마리 중량을 공개하지 않아
 *     (공식 사이트는 조리 전 생닭 중량만) 한국소비자원 시험 값·그 평균으로 계산 → 전부 trust 'estimated' + servingNote 한 줄.
 * (b) 중량을 모르는 나머지(순살·윙·사이드, 카페 베이글·케이크·아이스크림 레디팩 …) → 숫자는 그대로 두고
 *     제공량 표기만 인제스트의 "모르는 1인분" 형식("100 g 기준" + 안내 한 줄)으로 바꾼다. 같은 id 유지.
 *     (2026-09-26 부터 perServing.ts 가 이 중 근거가 있는 것을 1조각·1잔·1회 섭취참고량으로 다시 바꾼다)
 * (c) "반마리" 행인데 100 g 당 열량이 같은 메뉴 1마리 행과 25% 넘게 다른 것(데이터 자체가 이상한 것)은 (b) 로만 처리한다.
 *
 * (a) 의 원래 메뉴는 hidden 으로 돌려줘 예전 기록(menuId)이 id 로 계속 찾히게 한다 (perSlice 와 같음).
 */
import type { MenuItem, Nutrients } from '../domain/types';

export const PORTION_ID_SUFFIX = '-portion';

/** 한국소비자원 「프랜차이즈 치킨 품질 비교」(2022-11-15, 10개 브랜드 24개 제품) — 1마리 중량은 뼈 포함 전체 중량 */
export const KCA_CHICKEN_2022 = {
  report: 'https://www.kca.go.kr/smartconsumer/board/download.do?fno=10036885&bid=00000146&did=1003423534&menukey=7301',
  // 보고서 원문(kca.go.kr)은 이 환경에서 인증서 문제로 열리지 않아, 수치는 보도자료를 옮긴 기사로 확인 (2026-09-26)
  // 교촌오리지날 625 g · 24개 평균 879 g · "뼈와 가식부를 모두 포함한 전체 중량" · 고추바사삭 1,554 kcal(최저)
  news: 'http://www.foodnews.news/mobile/article.html?no=639957',
  // 교촌 레드오리지날 698 g
  news2: 'https://www.ntoday.co.kr/news/articleView.html?idxno=94652',
  kyochonOriginalG: 625,
  kyochonRedOriginalG: 698,
  averageG: 879,
  goobneGochuKcal: 1554,
} as const;

/** 교촌 공식 메뉴 페이지 — 한마리 "10호 닭 (951~1,050g)", 콤보 "조리 전 중량 920g" 등 (조리 전 중량만 공개) */
export const KYOCHON_MENU_URL = 'https://www.kyochon.com/menu/chicken.asp';
/** BBQ 공식 메뉴별 정보 — 영양성분은 100 g 당, 중량은 "한마리 : 10호 (951~1,050 g) 이상" 조리 전 기준만 */
export const BBQ_MENU_URL = 'https://m.bbq.co.kr/menu/menu_base.asp';
/** 굽네 공식 메뉴 — "조리 전 중량 뼈 한마리: 955g 이상" */
export const GOOBNE_MENU_URL = 'https://www.goobne.co.kr/menu/menu_view_p?itemId=30890';

type Kind = '1마리' | '반마리';
export interface PortionRule {
  kind: Kind;
  /** 1회(1마리·반마리) 중량 g — 100 g 값에 곱한다 */
  grams: number;
  /** 제공량 표기의 괄호 안 ("뼈 포함 약 625 g") */
  gramsLabel: string;
  /** 사용자에게 보이는 한 줄 */
  note: string;
  /** 중량 근거 출처 */
  source: string;
}

// ── 교촌 ──
const KY_WHOLE_AVG = Math.round((KCA_CHICKEN_2022.kyochonOriginalG + KCA_CHICKEN_2022.kyochonRedOriginalG) / 2); // 662
/** 교촌 한마리 조리 후(뼈 포함)/조리 전 비율 — 소비자원 두 제품 평균 662 g ÷ 10호 닭 중간값 1,000 g */
const KY_COOKED_RATIO = KY_WHOLE_AVG / 1000;
const kyWhole = (grams: number, note: string): PortionRule => ({ kind: '1마리', grams, gramsLabel: `뼈 포함 약 ${grams} g`, note, source: KCA_CHICKEN_2022.news });
const KY_WHOLE_DEFAULT = kyWhole(KY_WHOLE_AVG, `교촌 1마리 중량(소비자원 오리지날·레드오리지날 평균 ${KY_WHOLE_AVG} g, 뼈 포함)으로 계산한 추정치예요`);
/** 뼈 있는 부분육(콤보·스틱): 교촌 공식 조리 전 중량 × 교촌 1마리 조리 전후 비율 */
const kyParts = (rawG: number, kind: Kind = '1마리'): PortionRule => {
  const g = Math.round(rawG * KY_COOKED_RATIO);
  return {
    kind,
    grams: g,
    gramsLabel: `뼈 포함 약 ${g} g`,
    note: `조리 전 ${rawG} g(교촌 공식)에 교촌 1마리의 조리 전후 무게 비율을 곱한 추정치예요`,
    source: KYOCHON_MENU_URL,
  };
};

/**
 * 순살(뼈 없음): 교촌 공식 조리 전 중량 × 같은 조리 전후 비율 (2026-09-26 공식 메뉴 페이지 확인:
 * 간장·레드·반반[간장+레드] 순살 "정육, 조리 전 중량 700g", [S] 350 g · 허니순살 "정육+안심 500g", [반마리] 250 g ·
 * 반반순살[레드+허니] 600 g · 살살후라이드 "정육+가슴살 630g" · 파채소이살살 420 g)
 */
const kyBoneless = (rawG: number, kind: Kind = '1마리'): PortionRule => {
  const g = Math.round(rawG * KY_COOKED_RATIO);
  return {
    kind,
    grams: g,
    gramsLabel: `약 ${g} g`,
    note: `순살 조리 전 ${rawG} g(교촌 공식)에 교촌 1마리의 조리 전후 무게 비율을 곱한 추정치예요`,
    source: KYOCHON_MENU_URL,
  };
};

// ── BBQ: 조리 후 1마리 중량 공개가 없어 소비자원 24개 제품 평균 ──
const bbq = (kind: Kind): PortionRule => {
  const g = kind === '1마리' ? KCA_CHICKEN_2022.averageG : Math.round(KCA_CHICKEN_2022.averageG / 2);
  return {
    kind,
    grams: g,
    gramsLabel: `뼈 포함 약 ${g} g`,
    note: `조리 후 중량 공개가 없어 소비자원 조사 치킨 1마리 평균(뼈 포함 ${KCA_CHICKEN_2022.averageG} g)${kind === '반마리' ? '의 절반' : ''}으로 계산한 추정치예요`,
    source: KCA_CHICKEN_2022.news,
  };
};

// ── 굽네: 소비자원 고추바사삭 1마리 1,554 kcal ÷ 식약처 100 g 당 234 kcal ≈ 664 g ──
const GOOBNE_GOCHU_PER100 = 234;
const GOOBNE_WHOLE_G = Math.round((KCA_CHICKEN_2022.goobneGochuKcal / GOOBNE_GOCHU_PER100) * 100); // 664
const goobne = (self: boolean): PortionRule => ({
  kind: '1마리',
  grams: GOOBNE_WHOLE_G,
  gramsLabel: `약 ${GOOBNE_WHOLE_G} g`,
  note: self
    ? `소비자원 시험(2022) 고추바사삭 1마리 ${KCA_CHICKEN_2022.goobneGochuKcal.toLocaleString('en-US')} kcal에 맞춘 추정치예요`
    : `같은 뼈 한마리(조리 전 955 g)인 고추바사삭 1마리 중량(약 ${GOOBNE_WHOLE_G} g)으로 계산한 추정치예요`,
  source: KCA_CHICKEN_2022.news,
});

/** 브랜드 → 메뉴 이름(식약처 표기 그대로) → 규칙. 여기 없는 메뉴는 (b) 표기만 정직하게 */
export const CHICKEN_PORTIONS: Record<string, Record<string, PortionRule>> = {
  kyochon: {
    교촌오리지날: kyWhole(KCA_CHICKEN_2022.kyochonOriginalG, `소비자원이 잰 1마리 중량(뼈 포함 ${KCA_CHICKEN_2022.kyochonOriginalG} g)으로 계산한 추정치예요`),
    레드오리지날: kyWhole(KCA_CHICKEN_2022.kyochonRedOriginalG, `소비자원이 잰 1마리 중량(뼈 포함 ${KCA_CHICKEN_2022.kyochonRedOriginalG} g)으로 계산한 추정치예요`),
    허니오리지날: KY_WHOLE_DEFAULT,
    반반오리지날: KY_WHOLE_DEFAULT,
    '블랙시크릿 오리지날': KY_WHOLE_DEFAULT,
    리얼후라이드: KY_WHOLE_DEFAULT,
    // 콤보: 간장·레드 조리 전 920 g, 허니 880 g, (S) 반마리 460 g — 공식 메뉴 페이지
    교촌콤보: kyParts(920),
    레드콤보: kyParts(920),
    반반콤보: kyParts(920),
    레블반반콤보: kyParts(920),
    '블랙시크릿 콤보': kyParts(920),
    허니콤보: kyParts(880),
    '교촌콤보 (S)': kyParts(460, '반마리'),
    '레드콤보 (S)': kyParts(460, '반마리'),
    '블랙시크릿 콤보 (S)': kyParts(460, '반마리'),
    // 순살 — 식약처 이름 "교촌순살" 은 지금의 간장순살
    교촌순살: kyBoneless(700),
    레드순살: kyBoneless(700),
    반반순살: kyBoneless(700),
    '교촌순살 (S)': kyBoneless(350, '반마리'),
    '레드순살 (S)': kyBoneless(350, '반마리'),
    허니순살: kyBoneless(500),
    '허니순살 (S)': kyBoneless(250, '반마리'),
    레허반반순살: kyBoneless(600),
    살살후라이드: kyBoneless(630),
    파채소이살살: kyBoneless(420),
  },
  bbq: Object.fromEntries(
    [
      '황금올리브',
      '황금올리브 블랙페퍼',
      '황금올리브 레드착착',
      '황금올리브 크런치 버터',
      '핫황금올리브 크리스피',
      '오리지날 양념',
      '매운양념',
      '극한왕갈비',
      '단짠갈릭',
      '바삭갈릭',
      '소이갈릭스',
      '착착갈릭',
      '매달구',
      '황올한 깐풍',
      '블랙페퍼 반+레드착착 반',
      '크리스피 반+레드착착 반',
      '크리스피 반+블랙페퍼 반',
      '황올 반+매운양념 반',
      '황올 반+양념 반',
      '황올 반+크리스피 반',
    ].flatMap((k) => [
      [k, bbq('1마리')],
      [`${k} 반마리`, bbq('반마리')],
    ]),
  ),
  goobne: {
    고추바사삭: goobne(true),
    '오븐 바사삭': goobne(false),
    갈비천왕: goobne(false),
    볼케이노: goobne(false),
    불금: goobne(false),
    양념히어로: goobne(false),
    치즈바사삭: goobne(false),
    허니멜로: goobne(false),
  },
};

/**
 * 규칙 조회 키 — 공백을 하나로, "치킨" 단어를 뺀다.
 * "황금올리브 치킨 블랙페퍼 반마리" → "황금올리브 블랙페퍼 반마리", "교촌콤보 치킨 (S)" → "교촌콤보 (S)", "블랙시크릿 순살 치킨" → "블랙시크릿 순살"
 */
export function portionKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/치킨/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1인분 (100 g)" · "1인분 (100 ml)" → 단위. 100 g 기준인데 1인분으로 잡힌 표기만 */
export function per100Unit(serving: string): 'g' | 'ml' | null {
  const m = serving.match(/^1인분\s*\(\s*100\s*(g|ml)\s*\)$/);
  return m ? (m[1] as 'g' | 'ml') : null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = { kcal: Math.round(n.kcal * factor) };
  for (const k of ['carbs', 'protein', 'fat', 'satFat', 'sugar'] as const) {
    const v = n[k];
    if (typeof v === 'number') out[k] = round1(v * factor);
  }
  for (const k of ['sodium', 'caffeine'] as const) {
    const v = n[k];
    if (typeof v === 'number') out[k] = Math.round(v * factor);
  }
  return out;
}

/** 100 g 기준 메뉴 → 1마리·반마리 메뉴 (새 id, estimated) */
export function toPortion(menu: MenuItem, rule: PortionRule): MenuItem {
  const factor = rule.grams / 100;
  return {
    ...menu,
    id: `${menu.id}${PORTION_ID_SUFFIX}`,
    serving: `${rule.kind} (${rule.gramsLabel})`,
    nutrients: menu.nutrients ? scaleNutrients(menu.nutrients, factor) : null,
    trust: 'estimated',
    servingNote: rule.note,
  };
}

/** 인제스트(toServing)의 "1인분량을 모름" 형식과 같게 — 숫자는 그대로 */
export function toPer100Label(menu: MenuItem, unit: 'g' | 'ml'): MenuItem {
  return { ...menu, serving: `100 ${unit} 기준`, servingNote: `1인분 제공량 정보가 없어 100 ${unit} 기준으로 표시해요.` };
}

const HALF_RE = /\s*반마리$/;

export interface PerPortionResult {
  menus: MenuItem[];
  /** 목록에서 빠진 원래 100 g 메뉴 (id 조회용) */
  hidden: MenuItem[];
  /** 브랜드별 1마리·반마리로 바꾼 메뉴 수 */
  portionedByBrand: Record<string, number>;
  /** 브랜드별 "100 g 기준" 으로 표기만 바로잡은 메뉴 수 */
  relabeledByBrand: Record<string, number>;
}

/** 공공데이터(식약처) 메뉴만 대상 — 손으로 만든 시드는 건드리지 않는다 */
const isMfds = (m: MenuItem) => m.id.includes('-mfds-');

/** 목록 순서를 지키며 변환 (입력은 바꾸지 않는다) */
export function applyPerPortion(menus: MenuItem[]): PerPortionResult {
  // (c) 반마리 행 점검용: 브랜드|1마리 키 → 100 g 당 kcal
  const wholeKcal = new Map<string, number>();
  for (const m of menus) {
    if (isMfds(m) && m.nutrients && per100Unit(m.serving) && !HALF_RE.test(m.name)) wholeKcal.set(`${m.brandId}|${portionKey(m.name)}`, m.nutrients.kcal);
  }
  const hidden: MenuItem[] = [];
  const portionedByBrand: Record<string, number> = {};
  const relabeledByBrand: Record<string, number> = {};
  const out: MenuItem[] = [];
  for (const m of menus) {
    const unit = isMfds(m) ? per100Unit(m.serving) : null;
    if (!unit) {
      out.push(m);
      continue;
    }
    const key = portionKey(m.name);
    const rule = unit === 'g' ? CHICKEN_PORTIONS[m.brandId]?.[key] : undefined;
    let ok = !!rule && !!m.nutrients;
    if (ok && rule!.kind === '반마리' && HALF_RE.test(m.name)) {
      const w = wholeKcal.get(`${m.brandId}|${key.replace(HALF_RE, '')}`);
      if (w && Math.abs(m.nutrients!.kcal / w - 1) > 0.25) ok = false;
    }
    if (ok) {
      hidden.push(m);
      out.push(toPortion(m, rule!));
      portionedByBrand[m.brandId] = (portionedByBrand[m.brandId] ?? 0) + 1;
    } else {
      out.push(toPer100Label(m, unit));
      relabeledByBrand[m.brandId] = (relabeledByBrand[m.brandId] ?? 0) + 1;
    }
  }
  return { menus: out, hidden, portionedByBrand, relabeledByBrand };
}
