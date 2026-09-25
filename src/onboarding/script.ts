/**
 * 온보딩 챗봇(밀리) 대본 — 순수 함수만 (React 의존 없음, jest 테스트).
 * 수집 데이터·검증 범위·도메인 로직(목표량 계산·성향 분류)은 기존 B1~B7 그대로이고,
 * 여기서는 질문 문구, 선택지, 입력 검증 문구, 지난 단계 대화 기록(히스토리)만 만든다.
 * B1 에서 닉네임도 묻는다(로그인이 온보딩 뒤로 가서 세션 이름이 없을 수 있다).
 */
import { ACTIVITY_LABEL, GOAL_LABEL } from '../data/labels';
import { DIET_TYPES } from '../domain/diet';
import type { ActivityLevel, Goal, Sex } from '../domain/types';
import type { OnboardingDraft } from '../state/onboarding';

export const TOTAL_STEPS = 7;

export interface ChatLine {
  id: string;
  from: 'milly' | 'me';
  text: string;
}

export interface Option<T> {
  value: T;
  label: string;
  /** 자유 입력 매칭용 다른 표현 */
  aliases?: string[];
  description?: string;
}

// ── 선택지 ──────────────────────────────────────────────

export const SEX_OPTIONS: Option<Sex>[] = [
  { value: 'female', label: '여성', aliases: ['여', '여자', '여성이요'] },
  { value: 'male', label: '남성', aliases: ['남', '남자', '남성이요'] },
];

const ACTIVITY_ALIASES: Record<ActivityLevel, string[]> = {
  1: ['앉아', '거의안', '안움직'],
  2: ['가볍', '가끔'],
  3: ['보통', '적당'],
  4: ['활발', '자주'],
  5: ['매우활발', '아주', '많이'],
};

export const ACTIVITY_OPTIONS: Option<ActivityLevel>[] = ([1, 2, 3, 4, 5] as ActivityLevel[]).map((level) => ({
  value: level,
  label: ACTIVITY_LABEL[level].title,
  description: ACTIVITY_LABEL[level].description,
  aliases: ACTIVITY_ALIASES[level],
}));

/** 포지셔닝상 체중 항목이 맨 앞에 오지 않게: 건강관리 3종 → 체중 3종 (기존 B4 순서) */
export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: 'blood_sugar', label: GOAL_LABEL.blood_sugar, aliases: ['혈당', '당뇨'] },
  { value: 'cholesterol', label: GOAL_LABEL.cholesterol, aliases: ['콜레스테롤'] },
  { value: 'slow_aging', label: GOAL_LABEL.slow_aging, aliases: ['노화', '저속'] },
  { value: 'lose', label: GOAL_LABEL.lose, aliases: ['감량', '빼기', '살빼기', '다이어트'] },
  { value: 'maintain', label: GOAL_LABEL.maintain, aliases: ['유지'] },
  { value: 'gain', label: GOAL_LABEL.gain, aliases: ['증량', '벌크', '찌우기'] },
];

/** 부 목적으로 고를 수 있는 것 */
export const SECONDARY_GOALS: Goal[] = ['blood_sugar', 'cholesterol', 'slow_aging'];

export const NO_SECONDARY_LABEL = '없어요, 이거면 충분해요';

/** B5 예시 칩 — 누르면 입력칸에 문장을 이어 붙인다 */
export const DIET_EXAMPLES: { label: string; sentence: string }[] = [
  { label: '아침은 간단히', sentence: '아침은 간단히 먹는 편이에요.' },
  { label: '매운 음식 좋아해요', sentence: '매운 음식을 좋아해요.' },
  { label: '빵보다 밥', sentence: '빵보다 밥을 좋아해요.' },
  { label: '단 음식은 적게', sentence: '단 음식은 적게 먹으려고 해요.' },
];
export const DIET_MAX = 500;

// ── 닉네임 (로그인이 온보딩 뒤로 가서 챗봇 앞부분에서 묻는다) ──────────────

export const NAME_MAX = 12;
export const SKIP_NAME_LABEL = '건너뛸게요';
/** 이름을 안 알려주면 쓰는 기본 호칭 (services/auth NICKNAME_FALLBACK 과 같은 값) */
export const DEFAULT_NICKNAME = '회원';

/** 자유 입력 닉네임 정리: 앞뒤 공백·연속 공백 정리, 끝의 "님" 제거("지은님" → "지은"), 12자 제한. 비면 '' */
export function normalizeNickname(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  if (t.length > 1 && t.endsWith('님')) t = t.slice(0, -1).trim();
  return t.slice(0, NAME_MAX).trim();
}

/** 사용자 말풍선: 닉네임 또는 "건너뛸게요" */
export function nicknameAnswer(nickname?: string): string {
  return nickname?.trim() ? nickname.trim() : SKIP_NAME_LABEL;
}

const isDefaultNickname = (n?: string) => !n?.trim() || n.trim() === DEFAULT_NICKNAME;

/**
 * 로그인 뒤 프로필 닉네임을 세션 닉네임으로 채울지 — 프로필이 비었거나 기본값("회원")이고
 * 세션에 진짜 이름이 있을 때만 그 이름, 아니면 undefined (사용자가 정한 이름은 덮지 않는다)
 */
export function nicknameToFill(profileNickname: string | undefined, sessionNickname: string | undefined): string | undefined {
  if (!isDefaultNickname(profileNickname) || isDefaultNickname(sessionNickname)) return undefined;
  return sessionNickname!.trim();
}
export const SKIP_DIET_LABEL = '지금은 건너뛸게요';

/** 공백·문장부호를 뺀 소문자 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?~·'"]/g, '');
}

/**
 * 자유 입력을 선택지에 맞춰 본다 — 라벨/별칭이 입력에 들어 있거나 입력이 라벨에 들어 있으면 매칭.
 * 여러 개가 걸리면 가장 긴 라벨·별칭이 맞은 쪽. 못 찾으면 undefined.
 */
export function matchOption<T>(text: string, options: Option<T>[]): T | undefined {
  const q = normalize(text);
  if (!q) return undefined;
  // 1순위: 입력 안에 라벨·별칭이 통째로 들어 있음 → 가장 긴 것
  let best: { value: T; score: number } | undefined;
  // 2순위: 입력이 라벨의 일부 ("혈당" → "혈당 관리") → 한 선택지에만 걸릴 때만
  const partial = new Set<T>();
  for (const o of options) {
    for (const key of [o.label, ...(o.aliases ?? [])]) {
      const k = normalize(key);
      if (!k) continue;
      if (q.includes(k)) {
        if (!best || k.length > best.score) best = { value: o.value, score: k.length };
      } else if (q.length >= 2 && k.includes(q)) {
        partial.add(o.value);
      }
    }
  }
  if (best) return best.value;
  return partial.size === 1 ? [...partial][0] : undefined;
}

// ── 숫자 입력 검증 (기존 B2·B4 범위·문구 그대로) ─────────────────

export const THIS_YEAR = new Date().getFullYear();

export const RANGES = {
  birthYear: { min: 1930, max: THIS_YEAR - 10, msg: `1930~${THIS_YEAR - 10}년 사이로 입력해주세요.` },
  heightCm: { min: 100, max: 250, msg: '100~250cm 사이로 입력해주세요.' },
  weightKg: { min: 25, max: 250, msg: '25~250kg 사이로 입력해주세요.' },
  targetWeeks: { min: 1, max: 104, msg: '1~104주 사이로 입력해주세요.' },
} as const;

export type NumberField = 'birthYear' | 'heightCm' | 'weightKg' | 'targetWeightKg' | 'targetWeeks';

export function inRange(v: string, r: { min: number; max: number }): boolean {
  const n = Number(v);
  return v.length > 0 && Number.isFinite(n) && n >= r.min && n <= r.max;
}

/** 목표 체중: 25~250kg, 감량이면 지금보다 낮게 · 증량이면 높게 */
export function targetWeightValid(v: string, primary: Goal | undefined, currentKg: number | undefined): boolean {
  const n = Number(v);
  if (!(v.length > 0 && n >= 25 && n <= 250)) return false;
  if (currentKg == null) return true;
  return primary === 'lose' ? n < currentKg : n > currentKg;
}

export interface FieldCheck {
  valid: boolean;
  /** 입력 중 안내 문구 (기존 화면과 같은 타이밍) — 없으면 undefined */
  hint?: string;
}

/** 숫자 칸 검증 — 기존 B2·B4 의 표시 조건(몇 자리 입력했을 때 안내하는지)까지 같게 */
export function checkNumber(field: NumberField, v: string, ctx: { primaryGoal?: Goal; weightKg?: number } = {}): FieldCheck {
  switch (field) {
    case 'birthYear': {
      const valid = inRange(v, RANGES.birthYear);
      return { valid, hint: v.length >= 4 && !valid ? RANGES.birthYear.msg : undefined };
    }
    case 'heightCm': {
      const valid = inRange(v, RANGES.heightCm);
      return { valid, hint: (v.length >= 3 || Number(v) > RANGES.heightCm.max) && !valid ? RANGES.heightCm.msg : undefined };
    }
    case 'weightKg': {
      const valid = inRange(v, RANGES.weightKg);
      return { valid, hint: (v.length >= 3 || Number(v) > RANGES.weightKg.max) && !valid ? RANGES.weightKg.msg : undefined };
    }
    case 'targetWeightKg': {
      const valid = targetWeightValid(v, ctx.primaryGoal, ctx.weightKg);
      const msg = ctx.primaryGoal === 'lose' ? '지금 몸무게보다 낮게 입력해주세요.' : '지금 몸무게보다 높게 입력해주세요.';
      return { valid, hint: v.length >= 2 && !valid ? msg : undefined };
    }
    case 'targetWeeks': {
      const valid = inRange(v, RANGES.targetWeeks);
      return { valid, hint: v.length > 0 && !valid ? RANGES.targetWeeks.msg : undefined };
    }
  }
}

export const UNIT: Record<NumberField, string> = { birthYear: '년', heightCm: 'cm', weightKg: 'kg', targetWeightKg: 'kg', targetWeeks: '주' };

/** 사용자 말풍선 문구: 1995 → "1995년", 163 → "163cm" */
export function answerText(field: NumberField, n: number): string {
  return `${n}${UNIT[field]}`;
}

// ── 밀리 대사 ────────────────────────────────────────────

const named = (nickname?: string) => (nickname && nickname !== DEFAULT_NICKNAME ? `${nickname}님` : '');

export const SAY = {
  hello: (nickname?: string) => (named(nickname) ? `반가워요, ${named(nickname)}! 저는 밀리예요.` : '반가워요! 저는 밀리예요.'),
  intro: '먹기 전에 주변 메뉴를 먼저 살펴보고, 오늘 더 먹을 수 있는 만큼 알려드릴게요.',
  introAsk: '몇 가지만 물어볼게요. 1분이면 충분해요.',
  introReply: '좋아요, 시작할게요',
  haveAccount: '이미 계정이 있어요',
  askName: '뭐라고 불러드릴까요?',
  askNameSub: '앱에서 이 이름으로 불러드릴게요.',
  nameThanks: (nickname?: string) => (named(nickname) ? `좋아요, ${named(nickname)}이라고 부를게요.` : '좋아요, 그럼 바로 시작할게요.'),
  sex: '먼저 기본 정보부터요. 성별이 어떻게 되세요?',
  birthYear: '태어난 연도는요?',
  heightCm: '키는 몇 cm예요?',
  weightKg: '몸무게도 알려주세요. 하루 필요한 양을 계산하는 데만 써요.',
  activity: '평소 활동량은 어느 정도예요?',
  activitySub: '하루 필요한 에너지를 계산하는 데 써요.',
  goal: '어떤 목표로 식사를 관리하고 싶어요?',
  goalSub: '가장 중요한 한 가지를 골라주세요.',
  targetWeightKg: '목표 체중은 몇 kg이에요?',
  targetWeeks: '몇 주 동안 해볼까요?',
  secondary: '좋아요! 혹시 같이 신경 쓰고 싶은 것도 있어요?',
  diet: '평소 식사는 어떤 편이에요?',
  dietSub: '편하게 적어주시면 식단 성향을 정리하는 데 참고할게요. 예시를 눌러도 돼요.',
  analyzing: '적어주신 내용을 살펴보고 있어요…',
  result: (label: string, nickname?: string) => (named(nickname) ? `${named(nickname)}은 **${label}**에 가까워요.` : `**${label}**에 가까워요.`),
  resultAccept: '좋아요, 이대로 할게요',
  resultPick: '다른 유형을 고를래요',
  resultPicked: (label: string) => `좋아요, **${label}**으로 정리해둘게요.`,
  target: (kcal: string) => `다 됐어요! 오늘은 **${kcal}kcal** 드실 수 있어요.`,
  targetSub: '알려주신 정보로 계산한 하루 목표량이에요. 먹을 때마다 남은 양을 보여드릴게요.',
  location: '주변 매장 메뉴를 먼저 판정하려면 위치가 필요해요. 지금 허용할까요?',
  locationYes: '허용할게요',
  locationLater: '나중에 할게요',
  locationGranted: '허용했어요. 근처 매장 메뉴를 살펴볼게요.',
  locationDenied: '괜찮아요. 주변 탭에서 언제든 다시 허용할 수 있어요.',
  locationLaterReply: '좋아요, 나중에 주변 탭에서 허용할 수 있어요.',
  /** 첫 판정 체험 — 근처 1위 / 예시 메뉴 */
  firstPick: (good: boolean) => (good ? '지금 근처에서는 이 메뉴가 **좋아요**.' : '지금 근처에서는 이 메뉴가 **괜찮아요**.'),
  firstPickExample: (good: boolean) => (good ? '예를 들면 이런 메뉴가 지금 **좋아요**.' : '예를 들면 이런 메뉴가 지금 **괜찮아요**.'),
  firstPickTail: '먹기 전에 이렇게 알려드릴게요.',
  notMatched: '앗, 제가 잘 못 알아들었어요. 위 선택지에서 골라주시면 정확해요.',
} as const;

// ── 지난 단계 히스토리 ──────────────────────────────────────

const labelOf = <T>(options: Option<T>[], v: T | undefined) => options.find((o) => o.value === v)?.label;

export function secondaryAnswer(goals: Goal[]): string {
  return goals.length === 0 ? NO_SECONDARY_LABEL : goals.map((g) => GOAL_LABEL[g]).join(', ');
}

/**
 * step 번째 화면 위에 쌓아 둘 "지난 대화" — 1 ~ step-1 단계에서 이미 주고받은 말.
 * 드래프트에 답이 없으면 그 줄은 빼고, 다음 단계로 넘어간 적이 있는 답만 싣는다.
 */
export function historyBefore(step: number, draft: OnboardingDraft, ctx: { nickname?: string; greetName?: string } = {}): ChatLine[] {
  const out: ChatLine[] = [];
  const milly = (id: string, text: string) => out.push({ id, from: 'milly', text });
  const me = (id: string, text: string | undefined) => {
    if (text) out.push({ id, from: 'me', text });
  };

  if (step > 1) {
    // 첫인사는 이름을 묻기 전이라 로그인 세션 이름(greetName)만 쓴다
    milly('b1-hello', SAY.hello(ctx.greetName));
    milly('b1-intro', SAY.intro);
    milly('b1-ask', SAY.introAsk);
    me('b1-reply', SAY.introReply);
    milly('b1-name', SAY.askName);
    milly('b1-name-sub', SAY.askNameSub);
    me('b1-name-a', nicknameAnswer(draft.nickname));
    milly('b1-name-ok', SAY.nameThanks(draft.nickname?.trim() || undefined));
  }
  if (step > 2) {
    milly('b2-sex', SAY.sex);
    me('b2-sex-a', labelOf(SEX_OPTIONS, draft.sex));
    milly('b2-birth', SAY.birthYear);
    me('b2-birth-a', draft.birthYear != null ? answerText('birthYear', draft.birthYear) : undefined);
    milly('b2-height', SAY.heightCm);
    me('b2-height-a', draft.heightCm != null ? answerText('heightCm', draft.heightCm) : undefined);
    milly('b2-weight', SAY.weightKg);
    me('b2-weight-a', draft.weightKg != null ? answerText('weightKg', draft.weightKg) : undefined);
  }
  if (step > 3) {
    milly('b3-q', SAY.activity);
    me('b3-a', labelOf(ACTIVITY_OPTIONS, draft.activity));
  }
  if (step > 4) {
    milly('b4-q', SAY.goal);
    me('b4-a', labelOf(GOAL_OPTIONS, draft.primaryGoal));
    if (draft.primaryGoal === 'lose' || draft.primaryGoal === 'gain') {
      milly('b4-tw', SAY.targetWeightKg);
      me('b4-tw-a', draft.targetWeightKg != null ? answerText('targetWeightKg', draft.targetWeightKg) : undefined);
      milly('b4-weeks', SAY.targetWeeks);
      me('b4-weeks-a', draft.targetWeeks != null ? answerText('targetWeeks', draft.targetWeeks) : undefined);
    }
    milly('b4-sec', SAY.secondary);
    me('b4-sec-a', secondaryAnswer(draft.secondaryGoals.filter((g) => g !== draft.primaryGoal)));
  }
  if (step > 5) {
    milly('b5-q', SAY.diet);
    me('b5-a', draft.dietDescription.trim() || SKIP_DIET_LABEL);
  }
  if (step > 6 && draft.diet) {
    milly('b6-result', SAY.result(DIET_TYPES[draft.diet.type].label, ctx.nickname));
    me('b6-a', SAY.resultAccept);
  }
  return out;
}

/** 이어진 같은 화자 줄을 묶는다 — 밀리 묶음은 첫 줄에만 아바타·이름 */
export function groupLines(lines: ChatLine[]): ChatLine[][] {
  const groups: ChatLine[][] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && last[0].from === l.from) last.push(l);
    else groups.push([l]);
  }
  return groups;
}

/** B5 예시 문장을 입력칸에 이어 붙이기 (같은 문장은 한 번만, 최대 길이 유지) */
export function appendSentence(text: string, sentence: string, max = DIET_MAX): string {
  if (text.includes(sentence)) return text;
  const joined = text.trim().length === 0 ? sentence : `${text.trimEnd()}\n${sentence}`;
  return joined.slice(0, max);
}
