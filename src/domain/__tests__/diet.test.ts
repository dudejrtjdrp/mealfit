import { classifyDietByRules, normalizeDietText } from '../diet';
import type { DietType } from '../types';

describe('normalizeDietText', () => {
  it('문장부호 제거·공백 정리·소문자', () => {
    expect(normalizeDietText('  밥은  줄이고,   단백질!! 챙겨요. GS25  ')).toBe('밥은 줄이고 단백질 챙겨요 gs25');
    expect(normalizeDietText('단 거 적게\n\t먹어요~')).toBe('단 거 적게 먹어요');
  });
});

describe('classifyDietByRules', () => {
  const cases: [string, DietType][] = [
    ['요즘 밥 줄이고 닭가슴살 위주로 먹어요', 'low_carb_high_protein'],
    ['단 거 적게 먹으려고 해요', 'low_sugar'],
    ['짠 음식 피하고 국물 줄이는 편', 'low_sodium'],
    ['원래 소식해서 조금 먹어요', 'light_eater'],
    ['벌크업 중이라 운동 후에 많이 먹어요', 'high_protein_bulk'],
    ['점심은 거의 편의점이나 배달로 해결해요', 'convenience'],
    ['아무거나 잘 먹어요', 'balanced'],
    ['', 'balanced'],
  ];
  it.each(cases)('"%s" → %s', (text, type) => {
    const r = classifyDietByRules(text);
    expect(r.type).toBe(type);
    expect(r.source).toBe('rule');
  });

  it('evidence 는 항상 3개이고 제목이 겹치지 않는다', () => {
    for (const [text] of cases) {
      const r = classifyDietByRules(text);
      expect(r.evidence).toHaveLength(3);
      expect(new Set(r.evidence.map((e) => e.title)).size).toBe(3);
      for (const e of r.evidence) {
        expect(e.title.length).toBeGreaterThan(0);
        expect(e.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('서술 키워드 기반 근거가 먼저 온다', () => {
    const r = classifyDietByRules('단 거 적게, 카페 자주 가요');
    expect(r.type).toBe('low_sugar');
    expect(r.evidence[0].title).toBe('단 음식은 가끔만');
    expect(r.evidence.map((e) => e.title)).toContain('카페 메뉴도 자주 선택');
  });

  it('주 목적 힌트 가산', () => {
    expect(classifyDietByRules('', { primaryGoal: 'blood_sugar' }).type).toBe('low_sugar');
    expect(classifyDietByRules('평소대로 먹어요', { primaryGoal: 'gain' }).type).toBe('high_protein_bulk');
    // 서술이 더 강하면 서술을 따른다
    expect(classifyDietByRules('편의점 도시락, 카페 샌드위치, 바빠서 간편하게', { primaryGoal: 'gain' }).type).toBe('convenience');
  });

  it('공백 표기가 달라도 잡는다', () => {
    expect(classifyDietByRules('단거적게 먹어요').type).toBe('low_sugar');
  });

  it('시안 B6: 약한 신호만 있으면 균형형, 근거는 시안 톤', () => {
    const r = classifyDietByRules('아침은 가볍게 먹고, 점심은 든든하게 먹는 편이에요. 커피를 자주 마셔요.');
    expect(r.type).toBe('balanced');
    expect(r.evidence.map((e) => e.title)).toEqual(['가볍고 깔끔한 메뉴 선호', '카페 메뉴도 자주 선택', '단백질 균형 중요']);
  });

  it('균형형을 이기려면 키워드 2개 이상 또는 강한 키워드 1개', () => {
    expect(classifyDietByRules('가볍게 먹어요').type).toBe('balanced');
    expect(classifyDietByRules('가볍게, 조금씩 나눠 먹어요').type).toBe('light_eater');
    expect(classifyDietByRules('소식해요').type).toBe('light_eater');
    expect(classifyDietByRules('닭가슴살 좋아해요').type).toBe('balanced');
    expect(classifyDietByRules('닭가슴살이랑 두부 위주').type).toBe('low_carb_high_protein');
    expect(classifyDietByRules('밥 줄이는 중').type).toBe('low_carb_high_protein');
    expect(classifyDietByRules('저염식 해요').type).toBe('low_sodium');
    expect(classifyDietByRules('혈당 신경 써요').type).toBe('low_sugar');
    expect(classifyDietByRules('증량하고 싶어요').type).toBe('high_protein_bulk');
    expect(classifyDietByRules('커피 자주 마셔요').type).toBe('balanced');
  });

  it('균형형 + 커피 서술이면 "카페 메뉴도 자주 선택" 이 들어간다', () => {
    const r = classifyDietByRules('골고루 먹고 채소도 챙기고 커피는 매일');
    expect(r.type).toBe('balanced');
    expect(r.evidence).toHaveLength(3);
    expect(r.evidence.map((e) => e.title)).toContain('카페 메뉴도 자주 선택');
    expect(r.evidence[0].title).toBe('골고루 먹는 편이에요');
  });
});
