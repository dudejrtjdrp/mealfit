import { menuQtyUnit } from '../../domain/qty';
import type { MenuItem } from '../../domain/types';
import { getMenu, getMenus, getMenusByBrand, getPerPortionCounts } from '../index';
import { applyPerPortion, CHICKEN_PORTIONS, KCA_CHICKEN_2022, per100Unit, PORTION_ID_SUFFIX, portionKey, toPortion } from '../perPortion';

const byName = (brandId: string, name: string) => getMenusByBrand(brandId).find((m) => m.name === name);

describe('100 g 당 값이 1인분으로 잡힌 치킨 → 1마리·반마리 (perPortion)', () => {
  it('BBQ 황금올리브 치킨: 목록에는 1마리 메뉴만, 1,500 kcal 넘는 현실적인 값 (100 g 254 kcal × 879 g)', () => {
    const m = byName('bbq', '황금올리브 치킨')!;
    expect(m.id.endsWith(PORTION_ID_SUFFIX)).toBe(true);
    expect(m.serving).toBe('1마리 (뼈 포함 약 879 g)');
    expect(m.trust).toBe('estimated');
    expect(m.nutrients!.kcal).toBeGreaterThan(1500);
    expect(m.nutrients!.kcal).toBe(Math.round(254 * 8.79));
    expect(m.servingNote).toMatch(/소비자원/);
    // 예전 기록(원래 id)은 그대로 찾힌다 — 100 g 값 그대로
    const old = getMenu(m.id.slice(0, -PORTION_ID_SUFFIX.length));
    expect(old?.nutrients?.kcal).toBe(254);
    expect(getMenusByBrand('bbq').some((x) => x.id === old!.id)).toBe(false);
    // 반마리는 절반 중량
    const half = byName('bbq', '황금올리브 치킨 반마리')!;
    expect(half.serving).toBe('반마리 (뼈 포함 약 440 g)');
    expect(half.nutrients!.kcal).toBe(Math.round(254 * 4.4));
  });

  it('교촌오리지날은 소비자원 625 g, 굽네 고추바사삭은 소비자원 1,554 kcal 에 맞춘다', () => {
    const ky = byName('kyochon', '교촌오리지날 치킨')!;
    expect(ky.serving).toBe('1마리 (뼈 포함 약 625 g)');
    expect(ky.nutrients!.kcal).toBe(Math.round(314 * 6.25));
    const gb = byName('goobne', '고추바사삭 치킨')!;
    expect(gb.serving).toBe('1마리 (약 664 g)');
    expect(Math.abs(gb.nutrients!.kcal - KCA_CHICKEN_2022.goobneGochuKcal)).toBeLessThanOrEqual(5);
  });

  it('데이터가 이상한 반마리 행(100 g 당 열량이 1마리의 절반 수준)은 곱하지 않고 100 g 기준 표기만', () => {
    const m = byName('bbq', '매운양념 치킨 반마리')!;
    expect(m.serving).toBe('100 g 기준');
    expect(m.nutrients!.kcal).toBe(130);
  });

  it('공공데이터 메뉴 어디에도 "1인분 (100 g/ml)" 이 남지 않는다 — 1마리로 바꾸거나 "100 g 기준" 으로', () => {
    for (const m of getMenus()) if (m.id.includes('-mfds-')) expect(per100Unit(m.serving)).toBeNull();
    const c = getPerPortionCounts();
    expect(c.portionedByBrand.bbq).toBeGreaterThanOrEqual(20);
    expect(c.portionedByBrand.kyochon).toBeGreaterThanOrEqual(10);
    expect(c.portionedByBrand.goobne).toBe(8);
    expect(c.relabeledByBrand.baskin).toBe(29);
    // 표기만 바로잡은 메뉴(숫자는 그대로라 등급도 그대로)는 perServing 이 1회 섭취참고량으로 다시 바꾸고, 원래 id 로는 100 g 기준이 찾힌다
    const bagel = byName('hollys', '블루베리 베이글')!;
    expect(bagel.serving).toBe('1회 섭취참고량 (70 g)');
    const old = getMenu(bagel.id.replace(/-serving$/, ''))!;
    expect(old.serving).toBe('100 g 기준');
    expect(old.servingNote).toBe('1인분 제공량 정보가 없어 100 g 기준으로 표시해요.');
    expect(old.trust).toBe('official');
  });

  it('바꾼 메뉴는 모두 estimated + 한 줄 설명, official 은 sourceUrl 이 있다', () => {
    for (const m of getMenus()) {
      if (m.id.endsWith(PORTION_ID_SUFFIX)) {
        expect(m.trust).toBe('estimated');
        expect(m.servingNote).toMatch(/추정치예요$/);
        expect(m.serving).toMatch(/^(1마리|반마리) \((뼈 포함 )?약 \d+ g\)$/); // 순살은 "뼈 포함" 없이
        expect(menuQtyUnit(m)).toBe('인분');
      }
      if (m.trust === 'official') expect(m.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('규칙 표의 모든 키는 실제 데이터 메뉴와 맞는다 (오타로 조용히 빠지는 규칙이 없게)', () => {
    const src = [...getMenus(), ...getMenus().map((m) => (m.id.endsWith(PORTION_ID_SUFFIX) ? getMenu(m.id.slice(0, -PORTION_ID_SUFFIX.length)) : undefined))].filter(Boolean) as MenuItem[];
    for (const [brand, rules] of Object.entries(CHICKEN_PORTIONS)) {
      const keys = new Set(src.filter((m) => m.brandId === brand).map((m) => portionKey(m.name)));
      const unused = Object.keys(rules).filter((k) => !keys.has(k) && !/반마리$/.test(k));
      expect({ brand, unused }).toEqual({ brand, unused: [] });
    }
  });
});

describe('perPortion 순수 함수', () => {
  const base = { brandId: 'bbq', category: 'meal' as const, trust: 'official' as const, sourceUrl: 'https://example.com' };
  it('portionKey: "치킨" 을 빼고 공백 정리', () => {
    expect(portionKey('황금올리브 치킨 블랙페퍼 반마리')).toBe('황금올리브 블랙페퍼 반마리');
    expect(portionKey('교촌콤보 치킨 (S)')).toBe('교촌콤보 (S)');
    expect(portionKey('고추바사삭 치킨')).toBe('고추바사삭');
  });
  it('per100Unit: 1인분 (100 g|ml) 만', () => {
    expect(per100Unit('1인분 (100 g)')).toBe('g');
    expect(per100Unit('1인분 (100 ml)')).toBe('ml');
    expect(per100Unit('1인분 (250 g)')).toBeNull();
    expect(per100Unit('100 g 기준')).toBeNull();
  });
  it('toPortion: 모든 영양소를 중량/100 으로 곱하고 새 id·estimated', () => {
    const m: MenuItem = { ...base, id: 'bbq-mfds-x', name: '황금올리브 치킨', serving: '1인분 (100 g)', nutrients: { kcal: 254, protein: 18.8, sugar: 0.4, sodium: 408 } };
    const p = toPortion(m, CHICKEN_PORTIONS.bbq['황금올리브']);
    expect(p).toMatchObject({ id: 'bbq-mfds-x-portion', serving: '1마리 (뼈 포함 약 879 g)', trust: 'estimated', nutrients: { kcal: 2233, protein: 165.3, sugar: 3.5, sodium: 3586 } });
    expect(m.serving).toBe('1인분 (100 g)'); // 입력은 그대로
  });
  it('applyPerPortion: 시드·다른 제공량은 건드리지 않고, 모르는 메뉴는 100 g 기준 표기, ml 도 처리', () => {
    const mk = (id: string, brandId: string, name: string, serving = '1인분 (100 g)'): MenuItem => ({ ...base, id, brandId, name, serving, nutrients: { kcal: 300 } });
    const input = [
      mk('bbq-seed-1', 'bbq', '황금올리브 치킨'),
      mk('bbq-mfds-a', 'bbq', '황금올리브 치킨'),
      mk('bbq-mfds-b', 'bbq', '모둠 감자튀김'),
      mk('goobne-mfds-c', 'goobne', '웨지감자', '1인분 (250 g)'),
      mk('yog-mfds-d', 'yogerpresso', '뽕소다 스무디', '1인분 (100 ml)'),
    ];
    const r = applyPerPortion(input);
    expect(r.menus.map((m) => [m.id, m.serving])).toEqual([
      ['bbq-seed-1', '1인분 (100 g)'],
      ['bbq-mfds-a-portion', '1마리 (뼈 포함 약 879 g)'],
      ['bbq-mfds-b', '100 g 기준'],
      ['goobne-mfds-c', '1인분 (250 g)'],
      ['yog-mfds-d', '100 ml 기준'],
    ]);
    expect(r.hidden.map((m) => m.id)).toEqual(['bbq-mfds-a']);
    expect(r.relabeledByBrand).toEqual({ bbq: 1, yogerpresso: 1 });
  });
});
