import { cartKcal, cartQty, cartRemove, cartSetQty, cartStep, type Cart } from '../cart';

describe('매장 담기 장바구니', () => {
  it('처음 + 는 1개로 담고, 그다음은 단계대로 늘린다', () => {
    let c: Cart = [];
    c = cartStep(c, 'a', 1, '개');
    expect(c).toEqual([{ id: 'a', qty: 1 }]);
    c = cartStep(c, 'a', 1, '개');
    expect(cartQty(c, 'a')).toBe(1.25);
  });

  it('가장 작은 단계에서 − 를 누르면 뺀다', () => {
    let c: Cart = [{ id: 'a', qty: 0.75 }];
    c = cartStep(c, 'a', -1);
    expect(cartQty(c, 'a')).toBe(0.5);
    c = cartStep(c, 'a', -1);
    expect(c).toEqual([]);
    expect(cartStep([], 'x', -1)).toEqual([]);
  });

  it('조각은 1~6 정수, 1조각에서 − 는 뺀다', () => {
    let c = cartStep([], 'p', 1, '조각');
    expect(cartQty(c, 'p')).toBe(1);
    c = cartStep(c, 'p', 1, '조각');
    expect(cartQty(c, 'p')).toBe(2);
    expect(cartStep([{ id: 'p', qty: 1 }], 'p', -1, '조각')).toEqual([]);
    expect(cartStep([{ id: 'p', qty: 6 }], 'p', 1, '조각')).toEqual([{ id: 'p', qty: 6 }]);
  });

  it('담은 순서를 지키고, 시트에서 고친 수량을 그대로 반영한다', () => {
    let c = cartStep(cartStep([], 'a', 1), 'b', 1);
    c = cartSetQty(c, 'a', 1.5);
    expect(c).toEqual([
      { id: 'a', qty: 1.5 },
      { id: 'b', qty: 1 },
    ]);
    expect(cartSetQty(c, 'b', 0)).toEqual([{ id: 'a', qty: 1.5 }]);
    expect(cartRemove(c, 'a')).toEqual([{ id: 'b', qty: 1 }]);
  });

  it('kcal 합은 수량을 곱하고 정보 없는 메뉴는 0 으로 친다', () => {
    const base: Record<string, { kcal: number } | null> = { a: { kcal: 200 }, b: null };
    expect(cartKcal([{ id: 'a', qty: 1.5 }, { id: 'b', qty: 1 }], (id) => base[id])).toBe(300);
  });
});
