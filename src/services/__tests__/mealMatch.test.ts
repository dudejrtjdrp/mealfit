import { matchFood, matchLabel, withMenu } from '../ai/mealMatch';
import { searchMenus } from '../../data';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../products', () => {
  const actual = jest.requireActual('../products');
  return { ...actual, searchProductsRemote: jest.fn(async () => null) };
});

describe('matchFood', () => {
  it('같은 이름 메뉴는 그 데이터·신뢰등급 그대로', async () => {
    const r = await matchFood({ name: '쌀밥', amount: 0.5 });
    expect(r.kind).toBe('exact');
    expect(r.name).toBe('쌀밥');
    expect(r.trust).toBe('official');
    expect(r.qty).toBe(0.5);
    expect(r.base?.kcal).toBeGreaterThan(0);
  });

  it('브랜드 + 이름', async () => {
    const r = await matchFood({ name: '스타벅스 카페 라떼', amount: 1 });
    expect(r.kind).toBe('exact');
    expect(r.menu?.brandId).toBe('starbucks');
  });

  it('데이터에 딱 맞는 게 없으면 AI 추정(1인분)을 추정으로', async () => {
    const r = await matchFood({ name: '엄마표 잡채', amount: 1.5, guess: { kcal: 300 } });
    expect(r).toMatchObject({ kind: 'ai', trust: 'estimated', unit: '인분', qty: 1.5 });
    expect(r.base?.kcal).toBe(300);
    expect(matchLabel(r)).toContain('어림');
  });

  it('AI 추정도 없으면 비슷한 메뉴로 계산(추정)', async () => {
    const r = await matchFood({ name: '엄마표 라면', amount: 1 });
    expect(r.kind).toBe('similar');
    expect(r.trust).toBe('estimated');
  });

  it('일반 음식의 다른 이름도 같은 이름 — "돼지국밥" 은 레토르트 팩이 아니라 식당 돼지고기 국밥 1인분 (공식)', async () => {
    const r = await matchFood({ name: '돼지국밥', amount: 1 });
    expect(r.kind).toBe('exact');
    expect(r.menu).toMatchObject({ brandId: 'generic', name: '돼지고기 국밥', serving: '1인분 (1200 g)', trust: 'official' });
    expect(r.base?.kcal).toBeGreaterThan(700);
    expect(r.name).toBe('돼지고기 국밥');
    // 띄어 써도 같다
    expect((await matchFood({ name: '돼지 국밥', amount: 1 })).menu?.id).toBe(r.menu?.id);
  });

  it('짜장면·제육볶음·순대국밥도 식당·집밥 1인분으로 (시판 제품보다 먼저)', async () => {
    const jj = await matchFood({ name: '짜장면', amount: 1 });
    expect(jj).toMatchObject({ kind: 'exact', menu: { brandId: 'generic', name: '자장면' } });
    const jy = await matchFood({ name: '제육볶음', amount: 1 });
    expect(jy).toMatchObject({ kind: 'exact', menu: { brandId: 'generic', name: '돼지고기볶음 (제육볶음)' } });
    const sd = await matchFood({ name: '순대국밥', amount: 1 });
    expect(sd).toMatchObject({ kind: 'exact', menu: { brandId: 'generic', name: '순대국밥', serving: '1인분 (900 g)' } });
  });

  it('아무것도 못 찾으면 none', async () => {
    const r = await matchFood({ name: 'ㅁㄴㅇㄹ', amount: 1 });
    expect(r).toMatchObject({ kind: 'none', base: null });
  });

  it('직접 고른 메뉴로 바꾸기', async () => {
    const r = await matchFood({ name: 'ㅁㄴㅇㄹ', amount: 3 });
    const menu = searchMenus('쌀밥', 60).find((m) => m.name === '쌀밥')!;
    const w = withMenu(r, menu);
    expect(w).toMatchObject({ kind: 'exact', name: '쌀밥', trust: menu.trust });
    expect(w.base).not.toBeNull();
  });
});

describe('AI 추정 단위', () => {
  it('말한 단위를 그대로 쓴다 (반 마리 → 0.5마리)', async () => {
    const r = await matchFood({ name: '양념반후라이드반 수제치킨', amount: 0.5, unit: '마리', guess: { kcal: 1000 } });
    expect(r).toMatchObject({ kind: 'ai', unit: '마리', qty: 0.5 });
  });
  it('조각이면 1~6 조각 단계', async () => {
    const r = await matchFood({ name: '엄마표 치즈케이크 수제', amount: 2, unit: '조각', guess: { kcal: 350 } });
    expect(r).toMatchObject({ kind: 'ai', unit: '조각', qty: 2 });
  });
});
