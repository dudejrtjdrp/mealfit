/**
 * 같은 음료가 두 번 보이는 문제 정리 — 시드 옵션판(estimated + options)과 공공데이터 공식 사이즈판(official).
 * 예) 시드 "아이스 카페 라떼"(사이즈·우유 옵션) ↔ 공식 "카페 라떼 아이스(ICED) (Tall)" · "(Grande)" …
 *
 * 규칙
 * - 같은 브랜드에 이름(사이즈·온도 표기·공백 정규화 후)과 온도가 같은 official 이 있으면 시드판을 목록에서 뺀다.
 * - 시드판의 사이즈 외 옵션(시럽·우유·면 등)은 짝이 된 공식판마다 옮겨 붙인다 — 사이즈는 공식판이 이미 따로 있으므로 옮기지 않는다.
 * - 뺀 시드판은 hidden 으로 돌려준다 — 로더가 id 로는 계속 찾을 수 있게 둔다(예전 기록의 menuId).
 * React·JSON 의존 없는 순수 함수.
 */
import type { MenuItem, OptionGroup } from '../domain/types';

export type Temp = 'ice' | 'hot' | null;

/** 사이즈 표기 (괄호 안 단독 토큰) */
const SIZE_TOKENS = 'short|tall|grande|venti|trenta|regular|large|small|medium|xl|lg|rg|l|m|s|r|ex|레귤러|라지|스몰|미디엄|점보';
const PAREN_SIZE = new RegExp(`\\(\\s*(?:${SIZE_TOKENS}|\\d+(?:\\.\\d+)?\\s*(?:ml|oz|g|l|kcal))\\s*\\)`, 'gi');
const PAREN_TEMP = /\(\s*(?:iced?|hot|아이스|핫)\s*\)/gi;
/** 괄호 없이 붙은 영문 사이즈 ("카페 라떼 Tall") */
const BARE_SIZE = /(^|\s)(?:short|tall|grande|venti|trenta)(?=\s|$)/gi;
/** 단독 낱말 온도 ("아이스 카페 라떼", "카페 라떼 아이스") — "아이스크림"·"아이스티" 는 건드리지 않는다 */
const ICE_WORD = /(^|\s)(?:아이스|iced?)(?=\s|$)/gi;
const HOT_WORD = /(^|\s)(?:핫|hot)(?=\s|$)/gi;

/** 이름 → { 비교 키, 온도 }. 사이즈·온도 표기와 공백·기호를 뺀 나머지가 같으면 같은 음료 */
export function drinkKey(name: string): { base: string; temp: Temp } {
  let s = name.normalize('NFKC');
  const hasIce = /\(\s*(?:iced?|아이스)\s*\)/i.test(s) || new RegExp(ICE_WORD.source, 'i').test(s);
  const hasHot = /\(\s*(?:hot|핫)\s*\)/i.test(s) || new RegExp(HOT_WORD.source, 'i').test(s);
  s = s.replace(PAREN_SIZE, ' ').replace(PAREN_TEMP, ' ').replace(BARE_SIZE, ' ').replace(ICE_WORD, ' ').replace(HOT_WORD, ' ');
  const base = s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const temp: Temp = hasIce && !hasHot ? 'ice' : hasHot && !hasIce ? 'hot' : null;
  return { base, temp };
}

/** 시드 온도에 맞는 공식판 고르기 — 아이스 시드는 아이스(또는 온도 표기 없음), 그 외는 핫·표기 없음 우선, 없으면 아무거나 */
function pickByTemp(seedTemp: Temp, cands: { menu: MenuItem; temp: Temp }[]): MenuItem[] {
  if (seedTemp === 'ice') return cands.filter((c) => c.temp !== 'hot').map((c) => c.menu);
  const warm = cands.filter((c) => c.temp !== 'ice');
  return (warm.length ? warm : cands).map((c) => c.menu);
}

const isOptionSeed = (m: MenuItem) => m.trust === 'estimated' && (m.options?.length ?? 0) > 0;

export interface DedupeResult {
  menus: MenuItem[];
  /** 목록에서 뺀 시드판 (id 조회용으로 남긴다) */
  hidden: MenuItem[];
  /** 브랜드별로 공식판에 합친 시드 수 */
  mergedByBrand: Record<string, number>;
}

/** 시드 옵션판 ↔ 공식판 중복 정리 (순서 유지, 입력은 바꾸지 않는다) */
export function mergeSeedOptionsIntoOfficial(menus: MenuItem[]): DedupeResult {
  const officialByKey = new Map<string, { menu: MenuItem; temp: Temp }[]>();
  for (const m of menus) {
    if (m.trust !== 'official') continue;
    const { base, temp } = drinkKey(m.name);
    if (!base) continue;
    const k = `${m.brandId}|${base}`;
    const list = officialByKey.get(k) ?? [];
    list.push({ menu: m, temp });
    officialByKey.set(k, list);
  }

  const hiddenIds = new Set<string>();
  const hidden: MenuItem[] = [];
  const mergedByBrand: Record<string, number> = {};
  /** 공식판 id → 옮겨 붙일 옵션 그룹 */
  const extraOptions = new Map<string, OptionGroup[]>();
  /** 공식판 id → 시드 소개 문구 (공식판에 없을 때만) */
  const extraBlurb = new Map<string, string>();

  for (const s of menus) {
    if (!isOptionSeed(s)) continue;
    const { base, temp } = drinkKey(s.name);
    const cands = base ? officialByKey.get(`${s.brandId}|${base}`) : undefined;
    if (!cands?.length) continue;
    const targets = pickByTemp(temp, cands);
    if (!targets.length) continue;
    hiddenIds.add(s.id);
    hidden.push(s);
    mergedByBrand[s.brandId] = (mergedByBrand[s.brandId] ?? 0) + 1;
    const carry = (s.options ?? []).filter((g) => g.id !== 'size');
    for (const o of targets) {
      if (carry.length) {
        const list = extraOptions.get(o.id) ?? [];
        for (const g of carry) if (!list.some((x) => x.id === g.id)) list.push(g);
        extraOptions.set(o.id, list);
      }
      if (s.blurb && !o.blurb && !extraBlurb.has(o.id)) extraBlurb.set(o.id, s.blurb);
    }
  }

  const out: MenuItem[] = [];
  for (const m of menus) {
    if (hiddenIds.has(m.id)) continue;
    const add = extraOptions.get(m.id);
    const blurb = extraBlurb.get(m.id);
    if (!add && !blurb) {
      out.push(m);
      continue;
    }
    const next: MenuItem = { ...m };
    if (add) {
      const own = m.options ?? [];
      next.options = [...own, ...add.filter((g) => !own.some((x) => x.id === g.id)).map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c, delta: { ...c.delta } })) }))];
    }
    if (blurb) next.blurb = blurb;
    out.push(next);
  }
  return { menus: out, hidden, mergedByBrand };
}
