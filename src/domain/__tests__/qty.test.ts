import { QTY_OPTIONS, canStepQty, qtyLabel, qtyUnit, scaleNutrients, stepQty } from '../qty';

describe('기록 수량', () => {
  it('0.5~2 를 0.25 단위 7단계로 고른다', () => {
    expect([...QTY_OPTIONS]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });

  it('영양을 수량만큼 곱하고 소수 첫째 자리로 맞춘다', () => {
    expect(scaleNutrients({ kcal: 500, sodium: 1790, protein: 10.3 }, 0.75)).toEqual({ kcal: 375, sodium: 1342.5, protein: 7.7 });
    const n = { kcal: 100 };
    expect(scaleNutrients(n, 1)).toBe(n);
  });

  it('제공 단위를 이름으로 쓴다', () => {
    expect(qtyUnit('1개 (120 g)')).toBe('개');
    expect(qtyUnit('1잔')).toBe('잔');
    expect(qtyUnit('1회 섭취참고량 (120 g)')).toBe('회분');
    expect(qtyUnit('1인분 (300 g)')).toBe('인분');
    expect(qtyUnit(undefined)).toBe('인분');
    expect(qtyLabel(1.25, '개')).toBe('1.25개');
  });
});

describe('수량 스테퍼', () => {
  it('7단계 사이를 한 칸씩 움직이고 끝에서 멈춘다', () => {
    expect(stepQty(1, 1)).toBe(1.25);
    expect(stepQty(1, -1)).toBe(0.75);
    expect(stepQty(2, 1)).toBe(2);
    expect(stepQty(0.5, -1)).toBe(0.5);
    expect(canStepQty(2, 1)).toBe(false);
    expect(canStepQty(0.5, -1)).toBe(false);
    expect(canStepQty(1, 1)).toBe(true);
  });

  it('목록 밖 값은 가까운 단계로 들어온다', () => {
    expect(stepQty(3, -1)).toBe(2);
    expect(stepQty(0.3, 1)).toBe(0.5);
    expect(stepQty(1.1, 1)).toBe(1.25);
    expect(stepQty(1.1, -1)).toBe(1);
  });
});
