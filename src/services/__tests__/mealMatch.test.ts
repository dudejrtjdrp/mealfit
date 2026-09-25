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
    const r = await matchFood({ name: '라면', amount: 1 });
    expect(r.kind).toBe('similar');
    expect(r.trust).toBe('estimated');
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
