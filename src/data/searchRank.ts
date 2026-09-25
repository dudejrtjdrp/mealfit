import type { MenuItem } from '../domain/types';
import { PACKAGED_BRAND_ID } from './ingest/nutrition';

/**
 * 검색 순위 (기록 추가 E2 검색 · "잘 모르겠어요" 비슷한 메뉴) — 순수 함수.
 *
 * 한국어 합성 메뉴명은 머리(무엇인지)가 맨 뒤에 온다: "치킨 클럽"은 클럽 샌드위치, "황금올리브 치킨"은 치킨,
 * "라면왕김통깨"는 과자, "콜라겐 요거트스무디"는 스무디. 그래서 검색어가 이름의 머리(끝)에 있는 메뉴를
 * 앞머리·꾸밈말 자리에 있는 메뉴보다 앞에 둔다. 같은 단계 안에서는
 * 매장 메뉴 > 시판 제품, 그 음식을 주로 파는 브랜드(치킨 → BBQ·교촌·굽네) > 가끔 파는 브랜드(카페), 이름이 짧은 순.
 */

/** 이름 끝에 붙어도 무엇인지는 바꾸지 않는 양·사이즈·온도 말 ("황금올리브 치킨 반마리" 의 머리는 여전히 치킨) */
const TAIL_MODIFIERS = new Set([
  '반마리', '한마리', '마리', '순살', '뼈', '콤보', '세트', '냉장', '냉동',
  '핫', '아이스', 'hot', 'ice', 'iced', '큰사발', '사발', '용기', '컵', '미니', '점보', '라지', '레귤러',
  'l', 'm', 'r', 's', 'ml', 'max', 'tall', 'grande', 'venti',
]);

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export interface RankKey {
  /** 정규화 이름 */
  key: string;
  /** 브랜드명(시판 제품은 제조사) 정규화 */
  brandKey: string;
  /** 괄호를 빼고 끝의 양·사이즈 말을 뗀 단어들 (정규화) */
  tokens: string[];
  /** 브랜드 친화도를 셀 묶음: 매장 브랜드 id, 시판 제품은 제조사 */
  group: string;
  packaged: boolean;
}

export function rankKey(m: Pick<MenuItem, 'name' | 'brandId' | 'maker'>, brandName = ''): RankKey {
  const bare = m.name.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const tokens = bare
    .split(/[\s+/&,·]+/)
    .map(norm)
    .filter(Boolean);
  while (tokens.length > 1 && TAIL_MODIFIERS.has(tokens[tokens.length - 1])) tokens.pop();
  const key = norm(m.name);
  const packaged = m.brandId === PACKAGED_BRAND_ID;
  return {
    key,
    brandKey: norm(m.maker ?? brandName),
    tokens: tokens.length ? tokens : [key],
    group: packaged ? `pkg:${m.maker ?? ''}` : m.brandId,
    packaged,
  };
}

/**
 * 검색어가 이름의 어디에 있나 (작을수록 앞). 못 찾으면 -1.
 * 0 이름이 같음 · 1 양·사이즈 말을 뗀 이름이 같음, 또는 브랜드+검색어("농심라면")
 * · 2 이름의 머리(끝)가 검색어("황금올리브 치킨" ← 치킨), 또는 브랜드명이 검색어("스타벅스")
 * · 3 앞 단어의 끝이 검색어("황금올리브 치킨" ← 황금올리브) · 4 단어가 검색어로 시작(꾸밈말: "치킨 클럽"의 치킨은 3, "라면왕김통깨"·"콜라겐")
 *   또는 브랜드명 끝("교촌치킨") · 5 그 밖에 들어 있음
 */
export function matchTier(q: string, k: RankKey): number {
  if (!q || !(k.key.includes(q) || k.brandKey.includes(q))) return -1;
  if (k.key === q) return 0;
  const core = k.tokens.join('');
  if (core === q || (k.brandKey && (core === k.brandKey + q || k.key === k.brandKey + q))) return 1;
  if (core.endsWith(q) || k.brandKey === q) return 2;
  if (k.tokens.some((t) => t.endsWith(q))) return 3;
  if (k.tokens.some((t) => t.startsWith(q)) || k.brandKey.endsWith(q)) return 4;
  return 5;
}

/** 브랜드 친화도 → 단계: 0 그 음식을 주로 파는 브랜드(메뉴의 25% 이상, 3개 이상) · 1 그 밖 */
export function affinityBucket(share: number, count = Infinity): number {
  return share >= 0.25 && count >= 3 ? 0 : 1;
}

export interface Ranked<T> {
  item: T;
  tier: number;
  packaged: boolean;
  bucket: number;
  lenDiff: number;
  i: number;
}

export function compareRanked<T>(a: Ranked<T>, b: Ranked<T>): number {
  return a.tier - b.tier || Number(a.packaged) - Number(b.packaged) || a.bucket - b.bucket || a.lenDiff - b.lenDiff || a.i - b.i;
}

/**
 * 후보를 순위대로. keys[i] 는 items[i] 의 RankKey.
 * groupTotal: 묶음(브랜드)의 전체 메뉴 수 — 친화도 = 이 검색어에 걸린 수 ÷ 전체. 모르면(0) 후보 안의 수로만 본다.
 * 브랜드명에 검색어가 들어 있으면(교촌치킨·오뚜기라면) 친화도 최대.
 */
export function rankMatches<T>(q: string, items: T[], keys: RankKey[], groupTotal: (group: string) => number): T[] {
  const hits: { idx: number; tier: number }[] = [];
  const count = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const tier = matchTier(q, keys[i]);
    if (tier < 0) continue;
    hits.push({ idx: i, tier });
    count.set(keys[i].group, (count.get(keys[i].group) ?? 0) + 1);
  }
  const ranked: Ranked<T>[] = hits.map(({ idx, tier }) => {
    const k = keys[idx];
    const total = groupTotal(k.group);
    const n = count.get(k.group) ?? 0;
    const bucket = k.brandKey.includes(q) ? 0 : affinityBucket(total > 0 ? n / total : 0, n);
    // 이름에 검색어가 없는 브랜드 검색("스타벅스")은 길이로 섞지 않고 목록 순서 그대로
    const lenDiff = k.key.includes(q) ? Math.abs(k.tokens.join('').length - q.length) * 100 + Math.abs(k.key.length - q.length) : 0;
    return { item: items[idx], tier, packaged: k.packaged, bucket, lenDiff, i: idx };
  });
  ranked.sort(compareRanked);
  return ranked.map((r) => r.item);
}
