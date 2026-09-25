import {
  MAX_REQUESTS,
  activeTags,
  addRequest,
  mergePrefTags,
  parseRequestByRules,
  prefEffect,
  prefReason,
  prefTagLabel,
  sanitizePrefTags,
  type AssistantRequest,
  type PrefSubject,
  type PrefTag,
} from '../preferences';

const labels = (text: string) => parseRequestByRules(text).map(prefTagLabel);

describe('규칙 파서 — 효님 예시 3개', () => {
  it('아침엔 웬만하면 샐러드 위주로 먹고 싶어 → 아침 · 샐러드 위주 (soft)', () => {
    const tags = parseRequestByRules('아침엔 웬만하면 샐러드 위주로 먹고 싶어');
    expect(tags).toEqual([{ slot: 'breakfast', kind: 'prefer', strength: 'soft', target: { type: 'group', group: 'salad' } }]);
    expect(tags.map(prefTagLabel)).toEqual(['아침 · 샐러드 위주']);
  });

  it('빵은 통밀 위주로 → 빵을 고를 때만 통밀', () => {
    const tags = parseRequestByRules('빵은 통밀 위주로');
    expect(tags).toEqual([{ slot: 'any', kind: 'prefer', strength: 'soft', target: { type: 'attr', attr: 'wholeGrain' }, within: 'bread' }]);
    expect(tags.map(prefTagLabel)).toEqual(['빵 · 통밀로']);
  });

  it('저당 위주로 → 저당', () => {
    expect(parseRequestByRules('저당 위주로')).toEqual([{ slot: 'any', kind: 'prefer', strength: 'soft', target: { type: 'attr', attr: 'lowSugar' } }]);
    expect(labels('저당 위주로')).toEqual(['저당']);
  });
});

describe('규칙 파서 — 여러 말투', () => {
  it.each([
    ['매운 건 빼 줘', ['매운 것 빼기']],
    ['맵지 않게 해 줘', ['매운 것 덜']],
    ['달지 않게', ['저당']],
    ['단 거 줄여 줘', ['저당']],
    ['짜지 않게 먹고 싶어', ['저염']],
    ['저녁엔 가볍게', ['저녁 · 가볍게']],
    ['튀김은 웬만하면 피하고 싶어', ['튀김 덜']],
    ['오이 알레르기 있어요', ['오이 빼기']],
    ['점심엔 밥, 저녁엔 국물 요리', ['점심 · 밥 위주', '저녁 · 국물 요리 위주']],
    ['단백질 많은 거 위주로', ['고단백']],
    ['커피는 절대 안 돼', ['카페인 빼기']],
    ['두부 위주로 골라 줘', ['두부 위주']],
    ['통밀빵 위주로', ['빵 위주', '빵 · 통밀로']],
    ['빵이라면 통밀로', ['빵 · 통밀로']],
  ])('%s', (text, expected) => {
    expect(labels(text)).toEqual(expected);
  });

  it('먹으면 같은 말은 면으로 읽지 않는다', () => {
    expect(labels('아침에 먹으면 좋겠어')).toEqual([]);
  });

  it('알아들을 수 없으면 빈 목록', () => {
    expect(parseRequestByRules('')).toEqual([]);
    expect(parseRequestByRules('안녕 밀리')).toEqual([]);
  });

  it('알레르기는 꼭 빼기(hard)', () => {
    expect(parseRequestByRules('땅콩 알레르기')[0]).toMatchObject({ kind: 'avoid', strength: 'hard', target: { type: 'keyword', word: '땅콩' } });
  });
});

describe('AI 결과 검사 (어휘 밖 값은 버린다)', () => {
  it('모르는 갈래·특징·끼니·여러 대상은 버리고, 글에 없는 낱말도 버린다', () => {
    const raw = {
      tags: [
        { slot: 'breakfast', kind: 'prefer', strength: 'soft', group: 'salad', attr: null, keyword: null, within: null },
        { slot: 'brunch', kind: 'prefer', strength: 'soft', group: 'rice' }, // 끼니 모름 → any
        { slot: 'any', kind: 'prefer', strength: 'soft', group: 'sushi' }, // 갈래 모름
        { slot: 'any', kind: 'prefer', strength: 'soft', attr: 'keto' }, // 특징 모름
        { slot: 'any', kind: 'love', strength: 'soft', group: 'rice' }, // kind 모름
        { slot: 'any', kind: 'avoid', strength: 'hard', keyword: '땅콩' }, // 글에 없음
        { slot: 'any', kind: 'avoid', strength: 'hard', keyword: '오이' },
        { slot: 'any', kind: 'prefer', strength: 'soft', group: 'bread', attr: 'wholeGrain' }, // 둘 다
        { slot: 'any', kind: 'prefer', strength: 'soft', attr: 'wholeGrain', within: 'bread' },
      ],
    };
    const tags = sanitizePrefTags(raw, '아침엔 샐러드, 오이는 빼 줘, 빵은 통밀로');
    expect(tags.map(prefTagLabel)).toEqual(['아침 · 샐러드 위주', '밥 위주', '오이 빼기', '빵 · 통밀로']);
  });

  it('형식이 이상하면 빈 목록 · 태그는 4개까지', () => {
    expect(sanitizePrefTags('oops', 'x')).toEqual([]);
    expect(sanitizePrefTags(null, 'x')).toEqual([]);
    const many = ['bread', 'rice', 'noodle', 'soup', 'salad', 'porridge'].map((group) => ({ slot: 'any', kind: 'prefer', strength: 'soft', group }));
    expect(sanitizePrefTags(many, 'x')).toHaveLength(4);
  });

  it('AI + 규칙 합치기 — 같은 대상은 AI 쪽', () => {
    const ai: PrefTag[] = [{ slot: 'breakfast', kind: 'prefer', strength: 'hard', target: { type: 'group', group: 'salad' } }];
    const rules = parseRequestByRules('아침엔 샐러드 위주로, 매운 건 빼 줘');
    expect(mergePrefTags(ai, rules).map(prefTagLabel)).toEqual(['아침 · 꼭 샐러드', '매운 것 빼기']);
  });
});

function req(id: string, text: string, tags = parseRequestByRules(text)): AssistantRequest {
  return { id, text, tags, createdAt: `2026-09-26T0${id}:00:00Z`, source: 'rules' };
}

describe('요청 목록 — 5개까지', () => {
  it(`${MAX_REQUESTS}개가 차면 더 받지 않고, 지우면 다시 받는다`, () => {
    let list: AssistantRequest[] = [];
    const texts = ['저당 위주로', '빵은 통밀로', '매운 건 빼 줘', '저녁엔 가볍게', '오이 알레르기'];
    texts.forEach((t, i) => {
      const r = addRequest(list, req(String(i), t));
      expect(r.ok).toBe(true);
      if (r.ok) list = r.list;
    });
    expect(list).toHaveLength(5);
    expect(addRequest(list, req('9', '단백질 위주로'))).toEqual({ ok: false, reason: 'full' });
    list = list.filter((r) => r.id !== '2');
    expect(addRequest(list, req('9', '단백질 위주로')).ok).toBe(true);
  });

  it('빈 태그·같은 글은 받지 않는다', () => {
    expect(addRequest([], req('1', '안녕', []))).toEqual({ ok: false, reason: 'empty' });
    expect(addRequest([req('1', '저당 위주로')], req('2', '저당  위주로'))).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('activeTags — 같은 대상은 최근 요청이 이긴다', () => {
    const older = req('1', '매운 건 웬만하면 줄여 줘');
    const newer = req('2', '매운 건 빼 줘');
    const tags = activeTags([newer, older]);
    expect(tags).toHaveLength(1);
    expect(tags[0].strength).toBe('hard');
  });
});

const subject = (name: string, group: PrefSubject['group'], nutrients: Partial<PrefSubject['nutrients']> = {}): PrefSubject => ({
  name,
  group,
  kcal: nutrients.kcal ?? 400,
  nutrients: { kcal: 400, ...nutrients },
});

describe('prefEffect', () => {
  const tags = [...parseRequestByRules('아침엔 샐러드 위주로'), ...parseRequestByRules('매운 건 빼 줘'), ...parseRequestByRules('튀김은 웬만하면 줄여 줘'), ...parseRequestByRules('빵은 통밀로')];

  it('꼭 빼기는 후보에서 뺀다', () => {
    expect(prefEffect(tags, 'lunch', subject('불닭 볶음면', 'noodle')).excluded).toBe(true);
  });
  it('끼니가 맞는 좋아요만 점수를 올리고 hits 를 센다', () => {
    const salad = subject('닭가슴살 샐러드', 'salad');
    expect(prefEffect(tags, 'breakfast', salad)).toMatchObject({ excluded: false, hits: 1 });
    expect(prefEffect(tags, 'breakfast', salad).delta).toBeGreaterThan(0);
    expect(prefEffect(tags, 'lunch', salad)).toMatchObject({ delta: 0, hits: 0 });
  });
  it('덜은 점수만 깎는다 · 갈래 한정은 hits 에 세지 않는다', () => {
    expect(prefEffect(tags, 'lunch', subject('치킨 텐더', 'protein')).delta).toBeLessThan(0);
    const e = prefEffect(tags, 'lunch', subject('통밀 샌드위치', 'bread'));
    expect(e.delta).toBeGreaterThan(0);
    expect(e.hits).toBe(0);
  });
  it('영양 정보가 없으면 저당에 맞다고 치지 않는다', () => {
    const low = parseRequestByRules('저당 위주로');
    expect(prefEffect(low, 'lunch', subject('김밥', 'rice')).hits).toBe(0);
    expect(prefEffect(low, 'lunch', subject('김밥', 'rice', { sugar: 3 })).hits).toBe(1);
  });
});

describe('prefReason', () => {
  const base = { slot: 'breakfast' as const, label: '아침', budgetKcal: 600, hadMatch: () => true, hadExcluded: () => false };
  it('맞춘 요청', () => {
    expect(prefReason({ ...base, tags: parseRequestByRules('아침엔 샐러드 위주로'), main: subject('콥 샐러드', 'salad') })).toBe('요청하신 대로 아침은 샐러드로 골랐어요');
    expect(prefReason({ ...base, tags: parseRequestByRules('빵은 통밀로'), main: subject('통밀 샌드위치', 'bread') })).toBe('요청하신 대로 통밀빵으로 골랐어요');
    expect(prefReason({ ...base, tags: parseRequestByRules('저당 위주로'), main: subject('샐러드', 'salad', { sugar: 2 }) })).toBe('요청하신 대로 달지 않은 메뉴로 골랐어요');
  });
  it('근처에 없을 때', () => {
    const none = { ...base, hadMatch: () => false };
    expect(prefReason({ ...none, tags: parseRequestByRules('빵은 통밀로'), main: subject('에그 샌드위치', 'bread') })).toBe('근처에 통밀빵이 없어 일반 빵으로 골랐어요');
    expect(prefReason({ ...none, tags: parseRequestByRules('아침엔 샐러드 위주로'), main: subject('참치 김밥', 'rice') })).toBe('근처에 샐러드가 없어 다른 메뉴로 골랐어요');
  });
  it('근처에 있었지만 다른 끼니와 겹쳐 비켜 간 건 말하지 않는다', () => {
    expect(prefReason({ ...base, tags: parseRequestByRules('아침엔 샐러드 위주로'), main: subject('참치 김밥', 'rice') })).toBeUndefined();
  });
  it('꼭 빼 달라는 걸 뺐을 때', () => {
    expect(prefReason({ ...base, hadExcluded: () => true, tags: parseRequestByRules('매운 건 빼 줘'), main: subject('참치 김밥', 'rice') })).toBe('요청하신 대로 매운 건 빼고 골랐어요');
    expect(prefReason({ ...base, hadExcluded: () => true, tags: parseRequestByRules('오이는 빼 줘'), main: subject('참치 김밥', 'rice') })).toBe('요청하신 대로 오이는 빼고 골랐어요');
  });
});
