import type { DietClassification, DietType, DietTypeInfo, Goal } from './types';

export const DIET_TYPES: Record<DietType, DietTypeInfo> = {
  balanced: { type: 'balanced', label: '균형형 식사', description: '다양한 음식을 골고루 즐기며, 건강과 맛의 균형을 중요하게 생각하는 타입이에요.' },
  low_carb_high_protein: { type: 'low_carb_high_protein', label: '저탄고단형 식사', description: '밥·면·빵은 줄이고 단백질을 챙기는 타입이에요.' },
  low_sugar: { type: 'low_sugar', label: '저당형 식사', description: '단 음료와 디저트를 줄이고 혈당을 신경 쓰는 타입이에요.' },
  low_sodium: { type: 'low_sodium', label: '저염형 식사', description: '국물·짠 음식을 줄이고 담백하게 먹는 타입이에요.' },
  light_eater: { type: 'light_eater', label: '소식형 식사', description: '한 번에 많이 먹기보다 가볍게, 자주 먹는 타입이에요.' },
  high_protein_bulk: { type: 'high_protein_bulk', label: '고단백 증량형 식사', description: '운동과 함께 단백질과 열량을 충분히 챙기는 타입이에요.' },
  convenience: { type: 'convenience', label: '간편식형 식사', description: '편의점·카페처럼 빠르게 살 수 있는 한 끼가 많은 타입이에요.' },
};

export const DIET_TYPE_IDS = Object.keys(DIET_TYPES) as DietType[];

export function isDietType(v: unknown): v is DietType {
  return typeof v === 'string' && (DIET_TYPE_IDS as string[]).includes(v);
}

type Evidence = { title: string; detail: string };

/** 비교·캐시용 정규화: 문장부호 제거, 연속 공백 1개, trim, 소문자 */
export function normalizeDietText(text: string): string {
  return (text ?? '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface Rule {
  type: DietType;
  /** 강한 키워드 — 하나만 잡혀도 균형형을 이길 수 있다 */
  strong?: string[];
  /** 약한 키워드 — 같은 유형에서 2개 이상 모여야 균형형을 이긴다 */
  keywords: string[];
  evidence: Evidence;
}

/** 키워드 사전 — 규칙 하나가 잡히면 해당 유형 +1, 근거 문구 1개 */
const RULES: Rule[] = [
  // 저탄고단
  { type: 'low_carb_high_protein', strong: ['밥 줄이', '밥을 줄이', '밥은 줄이', '탄수 줄이', '탄수화물 줄이', '탄수를 줄이', '저탄'], keywords: ['밥 적게', '면 줄이', '빵 줄이'], evidence: { title: '밥·면·빵은 조금 덜어요', detail: '탄수화물을 줄이는 방향으로 드시고 있어요.' } },
  { type: 'low_carb_high_protein', keywords: ['단백질', '닭가슴살', '계란', '달걀', '두부', '프로틴'], evidence: { title: '단백질 균형 중요', detail: '닭가슴살, 달걀, 두부 등 단백질을 챙겨요.' } },
  // 저당
  { type: 'low_sugar', strong: ['단 거 적게', '단 거 줄이', '단 거 안', '단 음식 줄이', '단 음료 줄이', '당 줄이', '당을 줄이', '저당'], keywords: ['단 음식', '단 음료', '당류', '디저트 줄이', '달지 않'], evidence: { title: '단 음식은 가끔만', detail: '단 음료와 디저트를 줄이려고 해요.' } },
  { type: 'low_sugar', strong: ['혈당'], keywords: [], evidence: { title: '혈당을 신경 써요', detail: '식후 혈당이 천천히 오르는 메뉴가 잘 맞아요.' } },
  // 저염
  { type: 'low_sodium', strong: ['저염', '국물 줄이', '국물 안', '국물은 안', '짠 음식 줄이', '짜게 안'], keywords: ['짠', '싱겁', '싱거운', '나트륨'], evidence: { title: '짜지 않게 먹어요', detail: '국물과 짠 음식을 줄이고 있어요.' } },
  { type: 'low_sodium', keywords: ['담백', '깔끔'], evidence: { title: '가볍고 깔끔한 메뉴 선호', detail: '신선한 채소, 담백한 맛을 좋아해요.' } },
  // 소식
  { type: 'light_eater', strong: ['소식', '양이 적', '조금만 먹'], keywords: ['적게 먹', '조금 먹', '조금씩', '간단히', '배부르게 안'], evidence: { title: '한 끼는 가볍게', detail: '많이 먹기보다 적당히 나눠 먹어요.' } },
  // "가볍게" 는 약한 신호 — 균형형 서술에도 흔히 나온다
  { type: 'light_eater', keywords: ['가볍게', '가벼운'], evidence: { title: '가볍고 깔끔한 메뉴 선호', detail: '신선한 채소, 담백한 맛을 좋아해요.' } },
  // 고단백 증량
  { type: 'high_protein_bulk', strong: ['벌크', '증량'], keywords: ['운동 후', '헬스', '근육', '웨이트', '많이 먹'], evidence: { title: '운동과 함께 챙겨요', detail: '운동 후에 단백질과 열량을 충분히 챙겨요.' } },
  // 간편식
  { type: 'convenience', keywords: ['편의점', '도시락', '삼각김밥'], evidence: { title: '편의점 한 끼도 자주', detail: '도시락, 샐러드, 샌드위치를 편하게 골라요.' } },
  { type: 'convenience', keywords: ['카페', '커피', '샌드위치'], evidence: { title: '카페 메뉴도 자주 선택', detail: '샐러드, 샌드위치, 그릭요거트 등을 즐겨요.' } },
  { type: 'convenience', keywords: ['배달', '간편', '바빠', '바쁘', '시간이 없'], evidence: { title: '빠르게 먹는 날이 많아요', detail: '바쁜 날엔 간편하게 한 끼를 해결해요.' } },
  // 균형
  { type: 'balanced', keywords: ['골고루', '균형', '다양하게', '가리지 않', '한식', '집밥'], evidence: { title: '골고루 먹는 편이에요', detail: '밥, 반찬, 채소를 고르게 챙겨요.' } },
  { type: 'balanced', keywords: ['채소', '야채', '샐러드'], evidence: { title: '채소를 즐겨요', detail: '신선한 채소를 식사에 곁들여요.' } },
];

/** 유형별 기본 근거 — 서술에서 잡힌 게 부족할 때 채움 */
const DEFAULT_EVIDENCE: Record<DietType, Evidence[]> = {
  balanced: [
    { title: '가볍고 깔끔한 메뉴 선호', detail: '신선한 채소, 담백한 맛을 좋아해요.' },
    { title: '카페 메뉴도 자주 선택', detail: '샐러드, 샌드위치, 그릭요거트 등을 즐겨요.' },
    { title: '단백질 균형 중요', detail: '닭가슴살, 달걀, 두부 등 단백질을 챙겨요.' },
  ],
  low_carb_high_protein: [
    { title: '밥·면·빵은 조금 덜어요', detail: '탄수화물을 줄이는 방향으로 드시고 있어요.' },
    { title: '단백질 균형 중요', detail: '닭가슴살, 달걀, 두부 등 단백질을 챙겨요.' },
    { title: '든든한 한 끼 선호', detail: '단백질이 들어간 메뉴를 먼저 골라요.' },
  ],
  low_sugar: [
    { title: '단 음식은 가끔만', detail: '단 음료와 디저트를 줄이려고 해요.' },
    { title: '음료는 깔끔하게', detail: '아메리카노, 차처럼 달지 않은 음료가 잘 맞아요.' },
    { title: '천천히 오르는 식사', detail: '채소와 단백질을 먼저 곁들이면 좋아요.' },
  ],
  low_sodium: [
    { title: '짜지 않게 먹어요', detail: '국물과 짠 음식을 줄이고 있어요.' },
    { title: '가볍고 깔끔한 메뉴 선호', detail: '신선한 채소, 담백한 맛을 좋아해요.' },
    { title: '소스는 조금만', detail: '드레싱·소스를 덜어 드시면 더 잘 맞아요.' },
  ],
  light_eater: [
    { title: '한 끼는 가볍게', detail: '많이 먹기보다 적당히 나눠 먹어요.' },
    { title: '작은 사이즈가 편해요', detail: '반 인분, 작은 사이즈 메뉴가 잘 맞아요.' },
    { title: '간식도 한 끼처럼', detail: '요거트, 과일 같은 가벼운 간식을 챙겨요.' },
  ],
  high_protein_bulk: [
    { title: '운동과 함께 챙겨요', detail: '운동 후에 단백질과 열량을 충분히 챙겨요.' },
    { title: '단백질 균형 중요', detail: '닭가슴살, 달걀, 두부 등 단백질을 챙겨요.' },
    { title: '든든한 한 끼 선호', detail: '밥과 단백질을 넉넉하게 드시는 편이에요.' },
  ],
  convenience: [
    { title: '편의점 한 끼도 자주', detail: '도시락, 샐러드, 샌드위치를 편하게 골라요.' },
    { title: '카페 메뉴도 자주 선택', detail: '샐러드, 샌드위치, 그릭요거트 등을 즐겨요.' },
    { title: '빠르게 먹는 날이 많아요', detail: '바쁜 날엔 간편하게 한 끼를 해결해요.' },
  ],
};

/**
 * 목적 힌트. strong 이면 강한 키워드 1개처럼, 아니면 약한 키워드 1개처럼 센다.
 */
const GOAL_HINT: Partial<Record<Goal, { type: DietType; strong: boolean; evidence: Evidence }>> = {
  blood_sugar: { type: 'low_sugar', strong: true, evidence: { title: '혈당을 신경 써요', detail: '식후 혈당이 천천히 오르는 메뉴가 잘 맞아요.' } },
  gain: { type: 'high_protein_bulk', strong: true, evidence: { title: '든든하게 채우고 싶어요', detail: '단백질과 열량을 충분히 챙기면 좋아요.' } },
  lose: { type: 'low_carb_high_protein', strong: false, evidence: { title: '가볍게 관리하고 싶어요', detail: '단백질은 챙기고 밥·면은 조금 덜어요.' } },
  cholesterol: { type: 'low_sodium', strong: false, evidence: { title: '담백한 식사가 좋아요', detail: '기름지고 짠 메뉴는 가끔만 드셔요.' } },
};

/** 유형 동점일 때 우선순위 (구체적인 유형 먼저) */
const TIE_ORDER: DietType[] = [
  'low_sugar',
  'low_sodium',
  'low_carb_high_protein',
  'high_protein_bulk',
  'light_eater',
  'convenience',
];

const compactOf = (s: string) => s.toLowerCase().replace(/\s/g, '');

/**
 * 규칙 기반 분류 — 키워드 점수. 항상 evidence 3개를 채운다.
 * 균형형이 기본이고, 다른 유형이 이기려면 그 유형의 키워드가 2개 이상이거나 강한 키워드가 1개 있어야 한다.
 */
export function classifyDietByRules(text: string, hints?: { primaryGoal?: Goal }): DietClassification {
  const compact = compactOf(normalizeDietText(text));
  const hits = Object.fromEntries(DIET_TYPE_IDS.map((t) => [t, { keys: new Set<string>(), strong: false }])) as Record<
    DietType,
    { keys: Set<string>; strong: boolean }
  >;
  const matched: Rule[] = [];

  for (const rule of RULES) {
    const strongHits = (rule.strong ?? []).map(compactOf).filter((k) => k && compact.includes(k));
    const weakHits = rule.keywords.map(compactOf).filter((k) => k && compact.includes(k));
    if (strongHits.length + weakHits.length === 0) continue;
    matched.push(rule);
    const h = hits[rule.type];
    for (const k of [...strongHits, ...weakHits]) h.keys.add(k);
    if (strongHits.length) h.strong = true;
  }

  const hint = hints?.primaryGoal ? GOAL_HINT[hints.primaryGoal] : undefined;
  if (hint) {
    const h = hits[hint.type];
    h.keys.add(`goal:${hints!.primaryGoal}`);
    if (hint.strong) h.strong = true;
  }

  // 자격(강한 키워드 1개 또는 키워드 2개 이상)을 갖춘 유형 중 점수(강한 +1 가산) 최고
  let type: DietType = 'balanced';
  let best = 0;
  for (const t of TIE_ORDER) {
    const h = hits[t];
    if (!h.strong && h.keys.size < 2) continue;
    const score = h.keys.size + (h.strong ? 1 : 0);
    if (score > best) {
      best = score;
      type = t;
    }
  }

  // 근거
  let pool: Evidence[];
  if (type === 'balanced') {
    // 시안 B6 톤: 기본 3줄을 뼈대로, 서술에서 잡힌 균형형 근거를 앞에 둔다.
    // 커피·카페가 있으면 "카페 메뉴도 자주 선택" 은 반드시 들어간다(기본 2번째 줄).
    pool = [...matched.filter((r) => r.type === 'balanced').map((r) => r.evidence), ...DEFAULT_EVIDENCE.balanced];
    const cafe = DEFAULT_EVIDENCE.balanced[1];
    const hasCafe = matched.some((r) => r.evidence.title === cafe.title);
    const picked = uniqueTop(pool, 3);
    if (hasCafe && !picked.some((e) => e.title === cafe.title)) picked[2] = cafe;
    return { type, evidence: picked, source: 'rule' };
  }
  pool = [
    ...matched.filter((r) => r.type === type).map((r) => r.evidence),
    ...(hint && hint.type === type ? [hint.evidence] : []),
    ...matched.filter((r) => r.type !== type && r.type !== 'balanced').map((r) => r.evidence),
    ...DEFAULT_EVIDENCE[type],
  ];
  return { type, evidence: uniqueTop(pool, 3), source: 'rule' };
}

function uniqueTop(pool: Evidence[], n: number): Evidence[] {
  const out: Evidence[] = [];
  for (const e of pool) {
    if (out.length >= n) break;
    if (!out.some((x) => x.title === e.title)) out.push({ ...e });
  }
  return out;
}

/** 유형 기본 근거 3개 (AI 응답의 근거가 모자랄 때 채우기용) */
export function defaultEvidence(type: DietType): Evidence[] {
  return DEFAULT_EVIDENCE[type].map((e) => ({ ...e }));
}
