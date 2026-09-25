import {
  AI_MEAL_DAILY_LIMIT,
  detectMealType,
  parseAIMealResult,
  parseFoodPhrase,
  parseMealTextByRules,
  quotaConsume,
  quotaLeft,
  snapQty,
} from '../aiMeal';

describe('snapQty', () => {
  it('7단계 중 가장 가까운 값', () => {
    expect(snapQty(1)).toBe(1);
    expect(snapQty(0.6)).toBe(0.5);
    expect(snapQty(0.7)).toBe(0.75);
    expect(snapQty(1.4)).toBe(1.5);
    expect(snapQty(3)).toBe(2);
    expect(snapQty(0.1)).toBe(0.5);
  });
  it('조각은 1~6', () => {
    expect(snapQty(2, '조각')).toBe(2);
    expect(snapQty(9, '조각')).toBe(6);
    expect(snapQty(0.5, '조각')).toBe(1);
  });
  it('이상한 값은 1', () => {
    expect(snapQty(NaN)).toBe(1);
    expect(snapQty(-1)).toBe(1);
  });
});

describe('하루 횟수', () => {
  it('날짜가 바뀌면 다시 채워진다', () => {
    expect(quotaLeft(null, '2026-09-25')).toBe(AI_MEAL_DAILY_LIMIT);
    const r = quotaConsume(quotaConsume(null, '2026-09-25'), '2026-09-25');
    expect(r.count).toBe(2);
    expect(quotaLeft(r, '2026-09-25')).toBe(AI_MEAL_DAILY_LIMIT - 2);
    expect(quotaLeft(r, '2026-09-26')).toBe(AI_MEAL_DAILY_LIMIT);
    expect(quotaConsume(r, '2026-09-26').count).toBe(1);
    expect(quotaLeft({ date: '2026-09-25', count: 99 }, '2026-09-25')).toBe(0);
  });
});

describe('규칙 기반 나누기', () => {
  it('끼니·음식·양', () => {
    const r = parseMealTextByRules('점심에 김치찌개 한 그릇이랑 밥 반 공기 먹었어');
    expect(r.mealType).toBe('lunch');
    expect(r.source).toBe('rules');
    expect(r.items).toEqual([
      { name: '김치찌개', amount: 1, unit: '그릇', portion: '한 그릇' },
      { name: '밥', amount: 0.5, unit: '공기', portion: '반 공기' },
    ]);
  });
  it('쉼표·숫자·조각', () => {
    const r = parseMealTextByRules('피자 2조각, 콜라 1캔');
    expect(r.items.map((i) => [i.name, i.amount, i.unit])).toEqual([
      ['피자', 2, '조각'],
      ['콜라', 1, '캔'],
    ]);
  });
  it('한 개 반 · 조금 · 양 없음', () => {
    expect(parseFoodPhrase('삼각김밥 한 개 반')).toMatchObject({ name: '삼각김밥', amount: 1.5 });
    expect(parseFoodPhrase('떡볶이 조금')).toMatchObject({ name: '떡볶이', amount: 0.5 });
    expect(parseFoodPhrase('아메리카노')).toEqual({ name: '아메리카노', amount: 1 });
  });
  it('하고 · 그리고', () => {
    const r = parseMealTextByRules('아침으로 토스트하고 우유 그리고 사과 반 개');
    expect(r.mealType).toBe('breakfast');
    expect(r.items.map((i) => i.name)).toEqual(['토스트', '우유', '사과']);
    expect(r.items[2].amount).toBe(0.5);
  });
  it('사과·과자 같은 이름을 쪼개지 않는다', () => {
    expect(parseMealTextByRules('과자 한 봉지').items[0]).toMatchObject({ name: '과자', amount: 1, unit: '봉지' });
  });
  it('빈 글', () => {
    expect(parseMealTextByRules('   ').items).toEqual([]);
  });
});

describe('detectMealType', () => {
  it('끼니 단어', () => {
    expect(detectMealType('야식으로 치킨')).toBe('snack');
    expect(detectMealType('저녁은 파스타')).toBe('dinner');
    expect(detectMealType('라면')).toBeUndefined();
  });
});

describe('parseAIMealResult', () => {
  it('코드블록·군말이 섞여도 JSON 을 읽는다', () => {
    const raw = '```json\n{"mealType":"lunch","items":[{"name":"김치찌개","amount":1,"unit":"그릇","portion":"한 그릇","kcal":450.4,"protein":25}]}\n```';
    expect(parseAIMealResult(raw)).toEqual({
      mealType: 'lunch',
      items: [{ name: '김치찌개', amount: 1, unit: '그릇', portion: '한 그릇', guess: { kcal: 450, protein: 25 } }],
    });
  });
  it('잘못된 값은 걸러낸다', () => {
    const raw = JSON.stringify({ mealType: 'brunch', items: [{ name: '' }, { name: '밥', amount: -2, kcal: 'x' }, { name: '라면', amount: '0.5' }] });
    expect(parseAIMealResult(raw)).toEqual({ items: [{ name: '밥', amount: 1 }, { name: '라면', amount: 0.5 }] });
  });
  it('형식이 아니면 null', () => {
    expect(parseAIMealResult('모르겠어요')).toBeNull();
    expect(parseAIMealResult('{"foo":1}')).toBeNull();
  });
  it('최대 8개', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `음식${i}` }));
    expect(parseAIMealResult(JSON.stringify({ items }))?.items).toHaveLength(8);
  });
});
