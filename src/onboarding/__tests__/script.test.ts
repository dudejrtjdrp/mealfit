import type { OnboardingDraft } from '../../state/onboarding';
import {
  ACTIVITY_OPTIONS,
  GOAL_OPTIONS,
  NO_SECONDARY_LABEL,
  SEX_OPTIONS,
  SKIP_DIET_LABEL,
  SKIP_NAME_LABEL,
  THIS_YEAR,
  appendSentence,
  checkNumber,
  groupLines,
  historyBefore,
  matchOption,
  nicknameAnswer,
  nicknameToFill,
  normalizeNickname,
  secondaryAnswer,
} from '../script';

const base: OnboardingDraft = { secondaryGoals: [], dietDescription: '' };
const full: OnboardingDraft = {
  nickname: '성효',
  sex: 'female',
  birthYear: 1995,
  heightCm: 163,
  weightKg: 56,
  activity: 3,
  primaryGoal: 'lose',
  secondaryGoals: ['blood_sugar'],
  targetWeightKg: 52,
  targetWeeks: 12,
  dietDescription: '아침은 간단히 먹는 편이에요.',
  diet: { type: 'low_sugar', evidence: [], source: 'rule' },
};

describe('checkNumber — 기존 B2·B4 범위·안내 타이밍 그대로', () => {
  it('출생 연도: 4자리 입력 전에는 안내 없음, 범위 밖이면 안내', () => {
    expect(checkNumber('birthYear', '199')).toEqual({ valid: false, hint: undefined });
    expect(checkNumber('birthYear', '1995').valid).toBe(true);
    expect(checkNumber('birthYear', '1920').hint).toBe(`1930~${THIS_YEAR - 10}년 사이로 입력해주세요.`);
    expect(checkNumber('birthYear', String(THIS_YEAR - 5)).valid).toBe(false);
  });

  it('키·몸무게: 3자리이거나 최댓값을 넘으면 안내', () => {
    expect(checkNumber('heightCm', '99').hint).toBeUndefined();
    expect(checkNumber('heightCm', '099').hint).toBe('100~250cm 사이로 입력해주세요.');
    expect(checkNumber('heightCm', '170').valid).toBe(true);
    expect(checkNumber('weightKg', '24').valid).toBe(false);
    expect(checkNumber('weightKg', '24').hint).toBeUndefined();
    expect(checkNumber('weightKg', '300').hint).toBe('25~250kg 사이로 입력해주세요.');
    expect(checkNumber('weightKg', '58.5').valid).toBe(true);
  });

  it('목표 체중: 감량이면 지금보다 낮게, 증량이면 높게', () => {
    expect(checkNumber('targetWeightKg', '52', { primaryGoal: 'lose', weightKg: 56 }).valid).toBe(true);
    expect(checkNumber('targetWeightKg', '60', { primaryGoal: 'lose', weightKg: 56 })).toEqual({ valid: false, hint: '지금 몸무게보다 낮게 입력해주세요.' });
    expect(checkNumber('targetWeightKg', '52', { primaryGoal: 'gain', weightKg: 56 }).hint).toBe('지금 몸무게보다 높게 입력해주세요.');
    expect(checkNumber('targetWeightKg', '6', { primaryGoal: 'gain', weightKg: 56 }).hint).toBeUndefined();
  });

  it('기간: 1~104주', () => {
    expect(checkNumber('targetWeeks', '12').valid).toBe(true);
    expect(checkNumber('targetWeeks', '0').hint).toBe('1~104주 사이로 입력해주세요.');
    expect(checkNumber('targetWeeks', '105').valid).toBe(false);
  });
});

describe('matchOption — 자유 입력을 선택지에 맞추기', () => {
  it('라벨·별칭이 들어 있으면 매칭', () => {
    expect(matchOption('여자예요', SEX_OPTIONS)).toBe('female');
    expect(matchOption('남성이요', SEX_OPTIONS)).toBe('male');
    expect(matchOption('보통이에요', ACTIVITY_OPTIONS)).toBe(3);
    expect(matchOption('매우 활발해요', ACTIVITY_OPTIONS)).toBe(5);
    expect(matchOption('활발한 편', ACTIVITY_OPTIONS)).toBe(4);
    expect(matchOption('체중 감량이요', GOAL_OPTIONS)).toBe('lose');
    expect(matchOption('혈당', GOAL_OPTIONS)).toBe('blood_sugar');
  });

  it('여러 선택지에 걸리는 애매한 말이나 모르는 말은 매칭하지 않음', () => {
    expect(matchOption('관리', GOAL_OPTIONS)).toBeUndefined();
    expect(matchOption('글쎄요', GOAL_OPTIONS)).toBeUndefined();
    expect(matchOption('   ', SEX_OPTIONS)).toBeUndefined();
  });
});

describe('historyBefore — 지난 단계 대화', () => {
  it('B1 화면에는 히스토리가 없다', () => {
    expect(historyBefore(1, base)).toEqual([]);
  });

  it('B2 부터 밀리 인사·시작 답·이름 문답이 쌓인다', () => {
    const h = historyBefore(2, { ...base, nickname: '지은' });
    expect(h[0]).toMatchObject({ from: 'milly', text: '반가워요! 저는 밀리예요.' });
    expect(h.filter((l) => l.from === 'me').map((l) => l.text)).toEqual(['좋아요, 시작할게요', '지은']);
    expect(h.at(-1)).toMatchObject({ from: 'milly', text: '좋아요, 지은님이라고 부를게요.' });
  });

  it('첫인사는 이름을 묻기 전이라 로그인 세션 이름(greetName)만 쓴다', () => {
    expect(historyBefore(2, { ...base, nickname: '지은' }, { nickname: '지은', greetName: '성효' })[0].text).toBe('반가워요, 성효님! 저는 밀리예요.');
    expect(historyBefore(2, base, { greetName: '회원' })[0].text).toBe('반가워요! 저는 밀리예요.');
  });

  it('이름을 건너뛰면 "건너뛸게요" + 이름 없이 이어간다', () => {
    const h = historyBefore(2, { ...base, nickname: '' });
    expect(h.find((l) => l.id === 'b1-name-a')?.text).toBe(SKIP_NAME_LABEL);
    expect(h.at(-1)?.text).toBe('좋아요, 그럼 바로 시작할게요.');
  });

  it('B7 에서는 B1~B6 답이 모두 사용자 말풍선으로 들어 있다', () => {
    const me = historyBefore(7, full, { nickname: '성효' })
      .filter((l) => l.from === 'me')
      .map((l) => l.text);
    expect(me).toEqual(['좋아요, 시작할게요', '성효', '여성', '1995년', '163cm', '56kg', '보통', '체중 감량', '52kg', '12주', '혈당 관리', '아침은 간단히 먹는 편이에요.', '좋아요, 이대로 할게요']);
  });

  it('감량·증량이 아니면 목표 체중 질문이 없고, 부 목적이 없으면 "없어요"', () => {
    const d: OnboardingDraft = { ...full, primaryGoal: 'maintain', secondaryGoals: [], targetWeightKg: undefined, targetWeeks: undefined };
    const texts = historyBefore(5, d).map((l) => l.text);
    expect(texts).not.toContain('목표 체중은 몇 kg이에요?');
    expect(texts).toContain(NO_SECONDARY_LABEL);
  });

  it('B5 를 건너뛰었으면 "지금은 건너뛸게요"', () => {
    expect(historyBefore(6, { ...full, dietDescription: '' }).at(-1)?.text).toBe(SKIP_DIET_LABEL);
  });

  it('주 목적과 같은 부 목적은 답에서 뺀다', () => {
    expect(secondaryAnswer([])).toBe(NO_SECONDARY_LABEL);
    const h = historyBefore(5, { ...full, primaryGoal: 'blood_sugar', secondaryGoals: ['blood_sugar', 'slow_aging'] });
    expect(h.at(-1)?.text).toBe('저속노화');
  });

  it('id 는 겹치지 않는다', () => {
    const ids = historyBefore(7, full).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('groupLines · appendSentence', () => {
  it('같은 화자 줄을 묶는다', () => {
    const g = groupLines(historyBefore(3, full));
    expect(g[0].map((l) => l.from)).toEqual(['milly', 'milly', 'milly']);
    expect(g[1][0].from).toBe('me');
  });

  it('예시 문장은 줄바꿈으로 이어 붙이고 같은 문장은 한 번만', () => {
    const a = appendSentence('', '빵보다 밥을 좋아해요.');
    expect(a).toBe('빵보다 밥을 좋아해요.');
    const b = appendSentence(`${a}  `, '매운 음식을 좋아해요.');
    expect(b).toBe('빵보다 밥을 좋아해요.\n매운 음식을 좋아해요.');
    expect(appendSentence(b, '매운 음식을 좋아해요.')).toBe(b);
    expect(appendSentence('가'.repeat(499), '매운 음식을 좋아해요.').length).toBe(500);
  });
});

describe('닉네임', () => {
  it('입력 정리: 공백·끝의 "님" 제거, 12자 제한', () => {
    expect(normalizeNickname('  지은  ')).toBe('지은');
    expect(normalizeNickname('지은님')).toBe('지은');
    expect(normalizeNickname('김 지은')).toBe('김 지은');
    expect(normalizeNickname('님')).toBe('님');
    expect(normalizeNickname('   ')).toBe('');
    expect(normalizeNickname('가'.repeat(20))).toHaveLength(12);
  });

  it('말풍선: 비었으면 "건너뛸게요"', () => {
    expect(nicknameAnswer('지은')).toBe('지은');
    expect(nicknameAnswer('')).toBe(SKIP_NAME_LABEL);
    expect(nicknameAnswer(undefined)).toBe(SKIP_NAME_LABEL);
  });

  it('로그인 뒤: 프로필 이름이 비었거나 기본값일 때만 세션 이름으로 채운다', () => {
    expect(nicknameToFill('회원', '성효')).toBe('성효');
    expect(nicknameToFill('', '성효')).toBe('성효');
    expect(nicknameToFill('지은', '성효')).toBeUndefined();
    expect(nicknameToFill('회원', '회원')).toBeUndefined();
    expect(nicknameToFill('회원', undefined)).toBeUndefined();
  });
});
