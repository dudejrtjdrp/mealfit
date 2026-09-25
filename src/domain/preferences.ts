/**
 * 밀리에게 요청하기 — 사용자가 적은 부탁("아침엔 웬만하면 샐러드 위주로", "빵은 통밀로", "저당 위주로")을
 * 정해진 어휘(끼니 × 좋아요/빼 줘 × 음식 갈래·특징·짧은 낱말 × 웬만하면/꼭)의 태그로 바꿔 기억한다.
 *
 * - 어휘가 고정이라 규칙 기반 식단(domain/mealPlan)이 그대로 쓸 수 있고, AI 는 자유 글을 이 어휘에 맞추기만 한다
 *   (새 태그를 지어내지 않는다 — sanitizePrefTags 가 모르는 값은 버린다). 그래서 요청 수가 늘어도 토큰이 늘지 않는다.
 * - 요청은 MAX_REQUESTS(5)개까지 (2026-09-26 효님 결정) — 다 차면 하나를 지워야 새로 적을 수 있다.
 * - 알레르기 같은 말도 "이 낱말이 든 메뉴는 빼기"로만 다룬다 (메뉴 이름 기준 — 건강 판단은 하지 않는다).
 * 전부 순수 함수. React·저장소 의존 없음.
 */
import { FOOD_GROUP_WORD, type FoodGroup } from './foodGroup';
import type { MealType, Nutrients } from './types';

/** 기억하는 요청 수 상한 — 추천이 흐려지지 않게, AI 비용도 묶어 둔다 */
export const MAX_REQUESTS = 5;
/** 요청 하나에서 뽑는 태그 수 상한 */
export const MAX_TAGS_PER_REQUEST = 4;
/** 요청 글 길이 상한 */
export const REQUEST_MAX_LENGTH = 60;
/** 빼 줘 낱말(오이·스타벅스 등) 길이 상한 */
export const KEYWORD_MAX_LENGTH = 12;

export type PrefSlot = MealType | 'any';
export type PrefKind = 'prefer' | 'avoid';
/** soft: 웬만하면(점수만 올리고 내림) · hard: 꼭/절대(빼 줘는 후보에서 뺀다) */
export type PrefStrength = 'soft' | 'hard';

export type PrefAttr = 'lowSugar' | 'lowSodium' | 'highProtein' | 'light' | 'wholeGrain' | 'veggie' | 'spicy' | 'fried' | 'caffeine' | 'dairy';

/** 요청에 쓸 수 있는 음식 갈래 (기타 제외) */
export const PREF_GROUPS: readonly FoodGroup[] = ['bread', 'rice', 'noodle', 'soup', 'salad', 'protein', 'porridge', 'bunsik', 'light', 'sweets', 'drink'];
export const PREF_ATTRS: readonly PrefAttr[] = ['lowSugar', 'lowSodium', 'highProtein', 'light', 'wholeGrain', 'veggie', 'spicy', 'fried', 'caffeine', 'dairy'];
export const PREF_SLOTS: readonly PrefSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'any'];

export type PrefTarget = { type: 'group'; group: FoodGroup } | { type: 'attr'; attr: PrefAttr } | { type: 'keyword'; word: string };

export interface PrefTag {
  slot: PrefSlot;
  kind: PrefKind;
  strength: PrefStrength;
  target: PrefTarget;
  /** 이 갈래 메뉴를 고를 때만 ("빵은 통밀로" → 빵일 때 통밀) */
  within?: FoodGroup;
}

/** 저장하는 요청 하나 */
export interface AssistantRequest {
  id: string;
  /** 사용자가 적은 그대로 */
  text: string;
  tags: PrefTag[];
  createdAt: string;
  /** 어떻게 태그로 바꿨는지 (rules: 규칙 · ai · cache) */
  source: 'rules' | 'ai' | 'cache';
}

// ── 표시 ──────────────────────────────────────────────────────────────

const SLOT_WORD: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };

/** 칩 이름 (좋아요) */
const ATTR_LABEL: Record<PrefAttr, string> = {
  lowSugar: '저당',
  lowSodium: '저염',
  highProtein: '고단백',
  light: '가볍게',
  wholeGrain: '통밀·잡곡',
  veggie: '채소 많이',
  spicy: '매콤하게',
  fried: '튀김',
  caffeine: '카페인',
  dairy: '유제품',
};

/** 빼 줘 쪽 이름 ("매운 것 빼기") */
const ATTR_AVOID_WORD: Record<PrefAttr, string> = {
  lowSugar: '저당',
  lowSodium: '저염',
  highProtein: '고단백',
  light: '가벼운 것',
  wholeGrain: '통밀·잡곡',
  veggie: '채소',
  spicy: '매운 것',
  fried: '튀김',
  caffeine: '카페인',
  dairy: '유제품',
};

/** 이유 문구 "~ 메뉴로 골랐어요" */
const ATTR_ADJ: Record<PrefAttr, string> = {
  lowSugar: '달지 않은',
  lowSodium: '짜지 않은',
  highProtein: '단백질 많은',
  light: '가벼운',
  wholeGrain: '통밀·잡곡',
  veggie: '채소 많은',
  spicy: '매콤한',
  fried: '튀긴',
  caffeine: '카페인 든',
  dairy: '유제품 든',
};

function targetWord(t: PrefTarget): string {
  if (t.type === 'group') return FOOD_GROUP_WORD[t.group];
  if (t.type === 'attr') return ATTR_LABEL[t.attr];
  return t.word;
}

/** 칩 한 개 이름 — "아침 · 샐러드 위주", "빵 · 통밀로", "저당", "매운 것 빼기" */
export function prefTagLabel(tag: PrefTag): string {
  const t = tag.target;
  let body: string;
  if (tag.within && t.type === 'attr' && tag.kind === 'prefer') {
    body = `${FOOD_GROUP_WORD[tag.within]} · ${t.attr === 'wholeGrain' ? '통밀로' : ATTR_LABEL[t.attr]}`;
  } else if (tag.kind === 'avoid') {
    const w = t.type === 'attr' ? ATTR_AVOID_WORD[t.attr] : targetWord(t);
    body = `${w} ${tag.strength === 'hard' ? '빼기' : '덜'}`;
  } else if (t.type === 'attr') {
    body = tag.strength === 'hard' ? `꼭 ${ATTR_LABEL[t.attr]}` : ATTR_LABEL[t.attr];
  } else {
    body = tag.strength === 'hard' ? `꼭 ${targetWord(t)}` : `${targetWord(t)} 위주`;
  }
  return tag.slot === 'any' ? body : `${SLOT_WORD[tag.slot]} · ${body}`;
}

/** 같은 태그인지 가리는 열쇠 (끼니·대상·갈래 한정 — 좋아요/빼 줘·세기는 뒤에 온 것으로) */
export function prefTagKey(tag: PrefTag): string {
  const t = tag.target;
  const target = t.type === 'group' ? `g:${t.group}` : t.type === 'attr' ? `a:${t.attr}` : `k:${t.word}`;
  return `${tag.slot}|${target}|${tag.within ?? ''}`;
}

function dedupe(tags: PrefTag[]): PrefTag[] {
  const map = new Map<string, PrefTag>();
  for (const t of tags) map.set(prefTagKey(t), t);
  return [...map.values()].slice(0, MAX_TAGS_PER_REQUEST);
}

// ── 규칙 파서 ─────────────────────────────────────────────────────────

/** 공백 정리 */
export function normalizeRequestText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, REQUEST_MAX_LENGTH);
}

const SLOT_RULES: [MealType, RegExp][] = [
  ['breakfast', /아침|모닝|조식/],
  ['lunch', /점심|런치|중식/],
  ['dinner', /저녁|석식|디너/],
  ['snack', /간식|야식|출출/],
];

/** 특징 — 위에서부터 찾고, 찾은 말은 지운다 (뒤의 갈래 규칙이 다시 잡지 않게) */
const ATTR_RULES: { attr: PrefAttr; re: RegExp; /** 이 말 자체가 "좋아요/빼 줘"를 정한다 */ kind?: PrefKind }[] = [
  { attr: 'spicy', re: /맵지\s?않|안\s?맵|덜\s?맵/g, kind: 'avoid' },
  { attr: 'lowSugar', re: /저당|무설탕|슈가\s?프리|제로\s?슈가|당\s?(?:이\s?)?(?:적|낮|줄|덜)|당분|당류|설탕|단\s?(?:거|것|음식|맛)|달지\s?않|안\s?달|덜\s?달|달달|달콤|단것/g, kind: 'prefer' },
  { attr: 'lowSodium', re: /저염|저나트륨|나트륨|염분|짜지\s?않|안\s?짜|덜\s?짜|짠\s?(?:거|것|음식|맛)|싱겁|싱거/g, kind: 'prefer' },
  { attr: 'highProtein', re: /고단백|단백질|프로틴/g, kind: 'prefer' },
  { attr: 'light', re: /저칼로리|칼로리\s?(?:가\s?)?(?:낮|적)|가볍게|가벼운|라이트|소식/g, kind: 'prefer' },
  { attr: 'wholeGrain', re: /통밀|호밀|잡곡|현미|귀리|오트|통곡물|곡물|멀티그레인/g },
  { attr: 'veggie', re: /채소|야채|나물|섬유질/g },
  { attr: 'spicy', re: /매운|매콤|맵게|맵고|얼큰|마라|불닭|스파이시/g },
  { attr: 'fried', re: /튀김|튀긴|기름진|기름|프라이드|돈까스|돈가스|카츠/g },
  { attr: 'caffeine', re: /카페인|커피/g },
  { attr: 'dairy', re: /유제품|우유|치즈|유당|락토/g },
];

const GROUP_RULES: [FoodGroup, RegExp][] = [
  ['porridge', /죽/g],
  ['sweets', /디저트|케이크|케익|쿠키|도넛|과자|초콜릿|아이스크림|빙수|마카롱|사탕/g],
  ['drink', /음료|주스|탄산|콜라|사이다/g],
  ['salad', /샐러드|포케|샐러디/g],
  ['bunsik', /분식|떡볶이|순대|어묵|만두/g],
  ['noodle', /라면|국수|파스타|우동|짜장|짬뽕|냉면|쌀국수|면\s?(?:류|요리)|(?:^|\s)면(?=$|\s|은|는|이|을|으로|도)/g],
  ['soup', /국물|찌개|국밥|탕(?=$|\s|은|는|이|을|으로|류|도)|(?:^|\s)국(?=$|\s|은|는|이|을|으로|류|도)/g],
  ['rice', /덮밥|도시락|김밥|주먹밥|볶음밥|비빔밥|밥/g],
  ['bread', /빵|샌드위치|버거|햄버거|토스트|베이글|피자|브런치/g],
  ['protein', /고기|닭가슴살|닭고기|소고기|돼지고기|스테이크|육류/g],
  ['light', /요거트|요구르트|견과|고구마|계란|달걀/g],
];

const AVOID_RE = /빼|안\s?돼|안\s?되|싫|안\s?먹|못\s?먹|말고|없이|없는|피하|피해|줄이|줄여|덜|적게|알레르기|알러지|자제|별로|질려|그만/;
const HARD_RE = /절대|무조건|꼭|반드시|못\s?먹|알레르기|알러지|전혀|빼\s?(?:줘|주세요|주라|고)|제외|안\s?돼|만\s?(?:먹|주|골라)/;
const SOFT_RE = /웬만하면|되도록|가급적|가능하면|위주|주로|좀|조금|덜|줄이|줄여|많이|편이|자주/;
const PREFER_KEYWORD_RE = /위주|많이|들어간|좋아|자주|먹고\s?싶/;

/** 빼 줘 낱말을 찾을 때 걸러 낼 말 */
const STOP_WORDS = new Set(['나', '저', '제가', '내가', '좀', '그냥', '요즘', '오늘', '항상', '웬만하면', '되도록', '가급적', '절대', '무조건', '꼭', '메뉴', '음식', '거', '것', '건', '먹는', '먹을', '먹기', '때', '엔', '에는', '있어', '있어요', '해줘', '해', '주세요', '줘', '싶어', '위주로', '위주', '많이', '들어간']);
const JOSA_TAIL = /(?:은|는|을|를|도|만|엔|에는|에|랑|이랑|하고|으로|로|류|같은|들어간|든)$/;
/** 이·가는 세 글자 이상일 때만 뗀다 ("오이" 는 그대로) */
const stripJosa = (w: string) => {
  const a = w.replace(JOSA_TAIL, '');
  return a !== w || a.length < 3 ? a : a.replace(/(?:이|가)$/, '');
};

/** 문장을 나눈다 — 쉼표·마침표·줄바꿈·"그리고" */
function clauses(text: string): string[] {
  return text
    .split(/[,.!?;\n·]|그리고|그리고요/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function keywordFrom(rest: string): string | undefined {
  const tokens = rest
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(stripJosa)
    .filter((w) => w.length >= 1 && !STOP_WORDS.has(w) && !AVOID_RE.test(w) && !HARD_RE.test(w) && !SOFT_RE.test(w) && !/먹|싶|주세|해요|있어|없어|이에요|예요|에요/.test(w));
  const w = tokens[0];
  return w && w.length <= KEYWORD_MAX_LENGTH ? w : undefined;
}

/** 한 문장 → 태그 */
function parseClause(clause: string): PrefTag[] {
  // "아침밥" → 아침 (끼니만)
  // "빵이라면" 같은 조건 말을 라면으로 읽지 않게
  let rest = ` ${clause.replace(/(아침|점심|저녁)\s?밥/g, '$1').replace(/이라면/g, '은').replace(/(드|치|자|트|료|피)라면/g, '$1는')} `;
  const slots: PrefSlot[] = SLOT_RULES.filter(([, re]) => re.test(rest)).map(([s]) => s);
  for (const [, re] of SLOT_RULES) rest = rest.replace(new RegExp(re.source, 'g'), ' ');
  if (!slots.length) slots.push('any');

  const hasAvoidWord = AVOID_RE.test(rest);
  const soft = SOFT_RE.test(rest) && !/절대|못\s?먹|알레르기|알러지|전혀/.test(rest);
  const strength: PrefStrength = !soft && HARD_RE.test(rest) ? 'hard' : 'soft';
  const clauseKind: PrefKind = hasAvoidWord ? 'avoid' : 'prefer';

  const attrs: { attr: PrefAttr; kind: PrefKind }[] = [];
  for (const r of ATTR_RULES) {
    if (!r.re.test(rest)) continue;
    r.re.lastIndex = 0;
    rest = rest.replace(r.re, ' ');
    if (attrs.some((a) => a.attr === r.attr)) continue;
    // 설탕·짠 것처럼 "좋아요"가 정해진 말은 빼 달라고 해도 저당·저염으로
    attrs.push({ attr: r.attr, kind: r.kind === 'prefer' ? 'prefer' : r.kind === 'avoid' ? 'avoid' : clauseKind });
  }
  const groups: { group: FoodGroup; topic: boolean }[] = [];
  for (const [group, re] of GROUP_RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let found = false;
    let topic = false;
    while ((m = re.exec(rest))) {
      found = true;
      const after = rest.slice(m.index + m[0].length);
      if (/^\s?(?:은|는|이면|엔|에는|류는|종류는|먹을\s?때|고를\s?때|이라면|라면)/.test(after)) topic = true;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (!found) continue;
    re.lastIndex = 0;
    rest = rest.replace(re, ' ');
    if (!groups.some((g) => g.group === group)) groups.push({ group, topic });
  }

  const out: PrefTag[] = [];
  const preferAttrs = attrs.filter((a) => a.kind === 'prefer');
  for (const slot of slots) {
    // "빵은 통밀로" — 갈래 하나 + 좋아요 특징: 그 갈래를 고를 때만 특징을 챙긴다
    if (clauseKind === 'prefer' && groups.length === 1 && preferAttrs.length) {
      const g = groups[0];
      if (!g.topic) out.push({ slot, kind: 'prefer', strength, target: { type: 'group', group: g.group } });
      for (const a of preferAttrs) out.push({ slot, kind: 'prefer', strength, target: { type: 'attr', attr: a.attr }, within: g.group });
      for (const a of attrs.filter((x) => x.kind === 'avoid')) out.push({ slot, kind: 'avoid', strength, target: { type: 'attr', attr: a.attr } });
      continue;
    }
    for (const a of attrs) out.push({ slot, kind: a.kind, strength, target: { type: 'attr', attr: a.attr } });
    for (const g of groups) out.push({ slot, kind: clauseKind, strength, target: { type: 'group', group: g.group } });
  }
  // 아는 말이 없으면 짧은 낱말 하나 ("오이는 빼 줘", "두부 위주로")
  if (!out.length && (hasAvoidWord || PREFER_KEYWORD_RE.test(clause))) {
    const word = keywordFrom(rest);
    if (word) for (const slot of slots) out.push({ slot, kind: clauseKind, strength, target: { type: 'keyword', word } });
  }
  return out;
}

/** 규칙으로 태그 뽑기 — 키 없이도 동작. 못 뽑으면 [] */
export function parseRequestByRules(text: string): PrefTag[] {
  const t = normalizeRequestText(text);
  if (!t) return [];
  return dedupe(clauses(t).flatMap(parseClause));
}

// ── AI 결과 검사 ──────────────────────────────────────────────────────

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * AI 가 돌려준 태그를 어휘로 엄격히 거른다 — 모르는 끼니·갈래·특징은 버리고,
 * 낱말(keyword)은 사용자가 쓴 글에 실제로 있는 짧은 말만 받는다 (지어낸 낱말 방지).
 */
export function sanitizePrefTags(raw: unknown, originalText: string): PrefTag[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { tags?: unknown }).tags) ? (raw as { tags: unknown[] }).tags : [];
  const text = normalizeRequestText(originalText).replace(/\s/g, '');
  const out: PrefTag[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const slot: PrefSlot = isOneOf(PREF_SLOTS, o.slot) ? o.slot : 'any';
    if (!isOneOf(['prefer', 'avoid'] as const, o.kind)) continue;
    const strength: PrefStrength = o.strength === 'hard' ? 'hard' : 'soft';
    const within = isOneOf(PREF_GROUPS, o.within) ? o.within : undefined;
    const set = [o.group, o.attr, o.keyword].filter((v) => v !== null && v !== undefined && v !== '');
    if (set.length !== 1) continue;
    let target: PrefTarget | undefined;
    if (isOneOf(PREF_GROUPS, o.group)) target = { type: 'group', group: o.group };
    else if (isOneOf(PREF_ATTRS, o.attr)) target = { type: 'attr', attr: o.attr };
    else if (typeof o.keyword === 'string') {
      const w = o.keyword.replace(/\s/g, '');
      if (w && w.length <= KEYWORD_MAX_LENGTH && text.includes(w)) target = { type: 'keyword', word: w };
    }
    if (!target) continue;
    // 갈래 한정은 좋아요 특징에만 의미가 있다
    const keepWithin = within && target.type === 'attr' && o.kind === 'prefer';
    out.push({ slot, kind: o.kind, strength, target, ...(keepWithin ? { within } : {}) });
  }
  return dedupe(out);
}

/** AI 결과(검사 끝난 것) + 규칙 결과 — AI 를 앞에 두고, 규칙에서만 나온 것을 뒤에 더한다 (같은 대상이면 AI 쪽) */
export function mergePrefTags(ai: readonly PrefTag[], rules: readonly PrefTag[]): PrefTag[] {
  const keys = new Set(ai.map(prefTagKey));
  return dedupe([...ai, ...rules.filter((t) => !keys.has(prefTagKey(t)))]);
}

// ── 요청 목록 ─────────────────────────────────────────────────────────

export type AddRequestResult = { ok: true; list: AssistantRequest[] } | { ok: false; reason: 'full' | 'empty' | 'duplicate' };

/** 요청 추가 — 5개가 차 있으면 거절 (하나를 지워야 새로 적을 수 있다). 새 것이 맨 앞 */
export function addRequest(list: readonly AssistantRequest[], req: AssistantRequest): AddRequestResult {
  if (!req.tags.length) return { ok: false, reason: 'empty' };
  if (list.length >= MAX_REQUESTS) return { ok: false, reason: 'full' };
  const norm = (s: string) => normalizeRequestText(s).replace(/\s/g, '');
  if (list.some((r) => norm(r.text) === norm(req.text))) return { ok: false, reason: 'duplicate' };
  return { ok: true, list: [req, ...list] };
}

/** 저장된 요청들의 태그 전부 (식단에 넘길 것). 같은 대상은 최근 요청이 이긴다 */
export function activeTags(list: readonly AssistantRequest[]): PrefTag[] {
  const map = new Map<string, PrefTag>();
  for (const r of [...list].reverse()) for (const t of r.tags) map.set(prefTagKey(t), t);
  return [...map.values()];
}

// ── 메뉴에 맞추기 (식단·추천에서 쓴다) ────────────────────────────────

/** 메뉴 한 개를 볼 때 필요한 것 */
export interface PrefSubject {
  name: string;
  storeName?: string;
  group: FoodGroup;
  kcal: number;
  nutrients: Nutrients;
}

const WHOLE_GRAIN_RE = /통밀|호밀|잡곡|현미|귀리|오트|곡물|그레인|보리|흑미/;
const VEGGIE_RE = /샐러드|채소|야채|비빔|나물|포케|그린|가든|베지/;
const SPICY_RE = /매운|매콤|불닭|마라|짬뽕|떡볶이|고추|청양|스파이시|핫치킨|핫소스|닭갈비|낙지|주꾸미|쭈꾸미|김치찌개|얼큰|육개장|짬뽕/;
const FRIED_RE = /튀김|치킨|까스|카츠|가스|프라이드|너겟|강정|크리스피|고로케|텐동|후라이드|새우튀|탕수/;
const CAFFEINE_RE = /커피|카페|모카|아메리카노|에스프레소|콜드브루|라떼|카푸치노|마키아또|녹차|말차|홍차|에너지/;
const DAIRY_RE = /우유|치즈|라떼|요거트|요구르트|크림|버터|밀크|카푸치노/;

/** 이 특징에 맞는지. 영양 정보가 없어 알 수 없으면 false (맞다고 치지 않는다) */
export function attrMatches(attr: PrefAttr, s: PrefSubject, budgetKcal = 0): boolean {
  const n = s.nutrients;
  switch (attr) {
    case 'lowSugar':
      return typeof n.sugar === 'number' && n.sugar <= 5;
    case 'lowSodium':
      return typeof n.sodium === 'number' && n.sodium <= 600;
    case 'highProtein':
      return typeof n.protein === 'number' && (n.protein >= 20 || (s.kcal > 0 && (n.protein * 4) / s.kcal >= 0.25));
    case 'light':
      return budgetKcal > 0 ? s.kcal <= budgetKcal * 0.6 : s.kcal <= 400;
    case 'wholeGrain':
      return WHOLE_GRAIN_RE.test(s.name);
    case 'veggie':
      return s.group === 'salad' || VEGGIE_RE.test(s.name);
    case 'spicy':
      return SPICY_RE.test(s.name);
    case 'fried':
      return FRIED_RE.test(s.name);
    case 'caffeine':
      return (n.caffeine ?? 0) > 0 || CAFFEINE_RE.test(s.name);
    case 'dairy':
      return DAIRY_RE.test(s.name);
  }
}

const squash = (x: string) => x.toLowerCase().replace(/\s/g, '');

/** 태그 대상에 맞는지 (갈래 한정 within 은 보지 않는다 — tagApplies 에서) */
export function targetMatches(t: PrefTarget, s: PrefSubject, budgetKcal = 0): boolean {
  if (t.type === 'group') return s.group === t.group;
  if (t.type === 'attr') return attrMatches(t.attr, s, budgetKcal);
  const w = squash(t.word);
  return squash(s.name).includes(w) || (!!s.storeName && squash(s.storeName).includes(w));
}

/** 이 끼니·이 메뉴에 걸리는 태그인지 */
export function tagApplies(tag: PrefTag, slot: MealType, s: PrefSubject): boolean {
  if (tag.slot !== 'any' && tag.slot !== slot) return false;
  if (tag.within && s.group !== tag.within) return false;
  return true;
}

/** 점수 (좋아요 +, 덜 −) */
export const PREF_SOFT_BONUS = 35;
export const PREF_HARD_BONUS = 60;
export const PREF_SOFT_PENALTY = 40;

export interface PrefEffect {
  /** 꼭 빼 달라는 것에 걸려 후보에서 뺀다 */
  excluded: boolean;
  /** 점수에 더할 값 */
  delta: number;
  /** 맞춘 좋아요 태그 수 (갈래 한정 태그는 세지 않는다 — 빵이 아닌 끼니를 빵으로 끌어오지 않게) */
  hits: number;
}

/** 메뉴 한 개에 요청 태그를 적용한 결과 */
export function prefEffect(tags: readonly PrefTag[], slot: MealType, s: PrefSubject, budgetKcal = 0): PrefEffect {
  let delta = 0;
  let hits = 0;
  for (const tag of tags) {
    if (!tagApplies(tag, slot, s)) continue;
    const match = targetMatches(tag.target, s, budgetKcal);
    if (tag.kind === 'avoid') {
      if (!match) continue;
      if (tag.strength === 'hard') return { excluded: true, delta: 0, hits: 0 };
      delta -= PREF_SOFT_PENALTY;
    } else if (match) {
      delta += tag.strength === 'hard' ? PREF_HARD_BONUS : PREF_SOFT_BONUS;
      if (!tag.within) hits += 1;
    }
  }
  return { excluded: false, delta, hits };
}

// ── 이유 문구 ─────────────────────────────────────────────────────────

function finalConsonant(word: string): number {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return -1;
  return (c - 0xac00) % 28;
}
const euro = (w: string) => {
  const f = finalConsonant(w);
  return f > 0 && f !== 8 ? '으로' : '로';
};
const eunNeun = (w: string) => (finalConsonant(w) > 0 ? '은' : '는');
const iGa = (w: string) => (finalConsonant(w) > 0 ? '이' : '가');

/** "통밀빵" · "잡곡밥" · "달지 않은 샐러드" */
function withinWord(attr: PrefAttr, g: FoodGroup): string {
  const w = FOOD_GROUP_WORD[g];
  if (attr === 'wholeGrain') return g === 'bread' ? '통밀빵' : g === 'rice' ? '잡곡밥' : `통곡물 ${w}`;
  return `${ATTR_ADJ[attr]} ${w}`;
}

/** 좋아요 대상 → "샐러드" · "달지 않은 메뉴" · "두부 든 메뉴" */
function preferWord(t: PrefTarget): string {
  if (t.type === 'group') return FOOD_GROUP_WORD[t.group];
  if (t.type === 'attr') return `${ATTR_ADJ[t.attr]} 메뉴`;
  return `${t.word} 든 메뉴`;
}

/** 빼 줘 대상 → "매운 건" · "빵은" · "오이는" */
function avoidWord(t: PrefTarget): string {
  if (t.type === 'attr') {
    const w = ATTR_AVOID_WORD[t.attr];
    return w.endsWith('것') ? `${w.slice(0, -1)}건` : `${w}${eunNeun(w)}`;
  }
  const w = targetWord(t);
  return `${w}${eunNeun(w)}`;
}

export interface PrefReasonInput {
  slot: MealType;
  /** '아침' 등 */
  label: string;
  tags: readonly PrefTag[];
  /** 고른 주 메뉴 */
  main: PrefSubject;
  budgetKcal: number;
  /** 이 끼니 후보 중에 이 태그(갈래 한정 포함)에 맞는 게 있었는지 */
  hadMatch: (tag: PrefTag) => boolean;
  /** 꼭 빼 달라는 것 때문에 이 끼니 후보에서 빠진 게 있었는지 */
  hadExcluded: (tag: PrefTag) => boolean;
}

/**
 * 요청을 반영한 이유 한 줄 (없으면 undefined)
 * ① 요청을 못 맞춘 사정: "근처에 통밀빵이 없어 일반 빵으로 골랐어요" / "근처에 샐러드가 없어 다른 메뉴로 골랐어요"
 * ② 맞춘 요청: "요청하신 대로 아침은 샐러드로 골랐어요" / "요청하신 대로 통밀빵으로 골랐어요"
 * ③ 꼭 빼 달라는 걸 뺐을 때: "요청하신 대로 매운 건 빼고 골랐어요"
 */
export function prefReason(input: PrefReasonInput): string | undefined {
  const { slot, label, tags, main, budgetKcal } = input;
  const mine = tags.filter((t) => t.slot === 'any' || t.slot === slot);
  const slotFirst = [...mine].sort((a, b) => (a.slot === 'any' ? 1 : 0) - (b.slot === 'any' ? 1 : 0));
  const prefers = slotFirst.filter((t) => t.kind === 'prefer');

  // ① 갈래 한정 — 그 갈래를 골랐는데 특징이 안 맞고, 근처에 맞는 게 없었을 때
  for (const t of prefers) {
    if (!t.within || t.target.type !== 'attr' || main.group !== t.within) continue;
    const w = withinWord(t.target.attr, t.within);
    if (targetMatches(t.target, main, budgetKcal)) return `요청하신 대로 ${w}${euro(w)} 골랐어요`;
    if (!input.hadMatch(t)) return `근처에 ${w}${iGa(w)} 없어 일반 ${FOOD_GROUP_WORD[t.within]}${euro(FOOD_GROUP_WORD[t.within])} 골랐어요`;
  }
  // ② 맞춘 좋아요 (끼니를 정한 요청 먼저)
  for (const t of prefers) {
    if (t.within || !targetMatches(t.target, main, budgetKcal)) continue;
    const w = preferWord(t.target);
    const head = t.slot === 'any' ? '' : `${label}${eunNeun(label)} `;
    return `요청하신 대로 ${head}${w}${euro(w)} 골랐어요`;
  }
  // ① 못 맞춘 좋아요 — 근처에 없었을 때만 알린다 (다른 끼니와 겹쳐 비켜 간 건 말하지 않는다)
  for (const t of prefers) {
    if (t.within || input.hadMatch(t)) continue;
    const w = preferWord(t.target);
    return `근처에 ${w}${iGa(w)} 없어 다른 메뉴로 골랐어요`;
  }
  // ③ 꼭 빼 달라는 것
  for (const t of slotFirst) {
    if (t.kind !== 'avoid' || t.strength !== 'hard' || !input.hadExcluded(t)) continue;
    return `요청하신 대로 ${avoidWord(t.target)} 빼고 골랐어요`;
  }
  return undefined;
}

// ── AI 프롬프트 ───────────────────────────────────────────────────────

/** 프롬프트를 바꾸면 올린다 (캐시 열쇠에 들어간다) */
export const PREF_PROMPT_VERSION = 'pref-v1';

/** 어휘로만 답하게 하는 시스템 프롬프트 — 짧게 (요청 하나에 입력 ~400 토큰) */
export const PREF_SYSTEM_PROMPT = [
  '사용자가 식단 도우미에게 한 부탁을 태그로 바꾼다. JSON 하나만 답한다.',
  '{"tags":[{"slot":S,"kind":K,"strength":T,"group":G|null,"attr":A|null,"keyword":string|null,"within":G|null}]}',
  `S: ${PREF_SLOTS.join('|')} (끼니 언급 없으면 any)`,
  'K: prefer(좋아요·위주로) | avoid(빼 줘·싫어·줄여)',
  'T: soft(웬만하면·위주로·줄여) | hard(꼭·절대·못 먹어·알레르기)',
  `G: ${PREF_GROUPS.join('|')}`,
  `A: ${PREF_ATTRS.join('|')}`,
  'group·attr·keyword 중 정확히 하나만. keyword 는 위 목록에 없는 음식·재료·브랜드일 때만, 사용자 글에 있는 낱말 그대로 (12자 이하).',
  'within: "빵은 통밀로"처럼 특정 갈래를 고를 때만 적용할 attr 이면 그 갈래 (예: {"attr":"wholeGrain","within":"bread"}).',
  '"달지 않게"·"당 줄여" → attr lowSugar, prefer. "짜지 않게" → lowSodium, prefer. 목록에 없는 개념은 만들지 말고 빼라.',
  `태그는 ${MAX_TAGS_PER_REQUEST}개 이하. 식단과 관계없는 글이면 {"tags":[]}.`,
].join('\n');
