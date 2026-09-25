import { qtyOptionsFor, scaleNutrients, stepQty } from './qty';
import type { Nutrients } from './types';

/**
 * 매장 담기(D3) 장바구니 — 화면 상태로만 쓰는 순수 로직.
 * 담은 순서를 지키려고 배열로 둔다. 같은 메뉴는 한 줄(수량만 바뀜).
 */
export interface CartLine {
  id: string;
  qty: number;
}
export type Cart = CartLine[];

/** 처음 담을 때 수량 — 조각 단위도 1조각부터 */
export const CART_FIRST_QTY = 1;

export function cartQty(cart: Cart, id: string): number {
  return cart.find((l) => l.id === id)?.qty ?? 0;
}

/**
 * + / − 한 칸. 없던 메뉴의 + 는 1(개·인분·조각)로 담고, 가장 작은 단계에서 − 는 장바구니에서 뺀다.
 * 수량 단계는 domain/qty stepQty 와 같다 (0.5~2 의 7단계 · 조각 1~6).
 */
export function cartStep(cart: Cart, id: string, dir: 1 | -1, unit?: string): Cart {
  const cur = cart.find((l) => l.id === id);
  if (!cur) return dir > 0 ? [...cart, { id, qty: CART_FIRST_QTY }] : cart;
  if (dir < 0 && cur.qty <= qtyOptionsFor(unit)[0]) return cart.filter((l) => l.id !== id);
  const next = stepQty(cur.qty, dir, unit);
  return next === cur.qty ? cart : cart.map((l) => (l.id === id ? { ...l, qty: next } : l));
}

/** 수량을 직접 정한다 (기록 시트에서 고친 값). 0 이하면 뺀다 */
export function cartSetQty(cart: Cart, id: string, qty: number): Cart {
  if (qty <= 0) return cartRemove(cart, id);
  return cart.some((l) => l.id === id) ? cart.map((l) => (l.id === id ? { ...l, qty } : l)) : [...cart, { id, qty }];
}

export function cartRemove(cart: Cart, id: string): Cart {
  return cart.filter((l) => l.id !== id);
}

/** 담은 메뉴 kcal 합 — 영양 정보가 없는 메뉴는 0 으로 친다 */
export function cartKcal(cart: Cart, baseOf: (id: string) => Nutrients | null | undefined): number {
  return cart.reduce((s, l) => {
    const n = baseOf(l.id);
    return n ? s + scaleNutrients(n, l.qty).kcal : s;
  }, 0);
}
