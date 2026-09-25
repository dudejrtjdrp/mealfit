/**
 * 브랜드가 아닌 동네 식당("역삼 돼지국밥", 카카오 분류 "음식점 > 한식 > 국밥") → 그 가게에 있을 법한 대표 음식.
 * 가게의 실제 메뉴·영양표가 아니라 식약처 일반 음식 1인분을 **추정(estimated)** 으로 보여주는 근거다.
 * 순수 함수 — 음식 이름(검색 키)만 고르고, 실제 음식·영양은 로더(src/data/index.ts estimatedMenusForPlace)가 일반 음식 번들에서 찾는다.
 * 규칙은 작게 둔다: 이름·분류에 분명한 단서가 있을 때만, 한 가게에 몇 개만. 단서가 없으면 빈 목록(지어내지 않는다).
 */
import type { MenuItem } from '../domain/types';

/** 추정 메뉴 id 접미사 — 원래 일반 음식 id + 이것 (예전 기록·상세 화면이 getMenu 로 다시 찾는다) */
export const PLACE_EST_ID_SUFFIX = '-est';
/** 한 가게에 보여줄 추정 메뉴 최대 수 */
export const PLACE_DISH_LIMIT = 6;

interface PlaceRule {
  /** 가게 이름 또는 카카오 분류에서 찾는 단서 */
  re: RegExp;
  /** 일반 음식 이름(다른 이름 포함) — 앞에 있을수록 먼저 */
  dishes: string[];
}

/**
 * 앞 규칙이 먼저. 가게 이름에서 걸린 규칙이 분류에서 걸린 규칙보다 앞선다 ("○○돼지국밥" → 돼지국밥이 맨 앞).
 * 음식 이름은 일반 음식 번들에 1인분 중량이 있는 것만 실제로 쓰인다(없으면 조용히 건너뜀).
 */
export const PLACE_DISH_RULES: PlaceRule[] = [
  { re: /돼지국밥|돼지 국밥/, dishes: ['돼지국밥', '순대국밥', '돼지머리국밥'] },
  { re: /순대국|순댓국/, dishes: ['순대국', '순대국밥', '돼지국밥', '순대'] },
  { re: /콩나물국밥/, dishes: ['콩나물국밥'] },
  { re: /국밥/, dishes: ['돼지국밥', '순대국밥', '소고기국밥', '콩나물국밥'] },
  { re: /감자탕|뼈해장|뼈다귀/, dishes: ['뼈다귀해장국', '감자탕'] },
  { re: /해장국/, dishes: ['선지해장국', '뼈다귀해장국', '우거지해장국', '황태해장국', '콩나물국밥'] },
  { re: /설렁탕|곰탕/, dishes: ['설렁탕', '곰탕', '꼬리곰탕', '도가니탕'] },
  { re: /갈비탕/, dishes: ['갈비탕'] },
  { re: /추어탕/, dishes: ['추어탕'] },
  { re: /삼계탕|백숙/, dishes: ['삼계탕', '닭백숙', '오리백숙'] },
  { re: /닭갈비/, dishes: ['닭갈비', '볶음밥'] },
  { re: /찜닭/, dishes: ['안동찜닭 닭찜'] },
  { re: /부대찌개/, dishes: ['부대찌개'] },
  { re: /순두부/, dishes: ['초당순두부', '김치 순두부찌개'] },
  { re: /찌개|전골|백반|기사식당|한식뷔페/, dishes: ['김치찌개', '된장찌개', '부대찌개', '제육볶음', '비빔밥'] },
  { re: /삼겹살|고깃집|고기집|육류|숯불|돼지갈비|갈비(?!탕)|목살/, dishes: ['삼겹살', '돼지갈비', '소갈비', '된장찌개', '물냉면'] },
  { re: /족발|보쌈/, dishes: ['족발'] },
  { re: /곱창|막창/, dishes: ['소곱창 구이', '곱창전골', '곱창 순대볶음'] },
  { re: /냉면|막국수|밀면/, dishes: ['물냉면', '비빔냉면', '회냉면', '막국수'] },
  { re: /칼국수|국수|수제비/, dishes: ['칼국수', '해물칼국수', '잔치국수', '비빔국수', '수제비'] },
  { re: /만두/, dishes: ['고기만두', '김치만두', '만둣국', '군만두'] },
  { re: /중식|중국|중화|반점|짜장|짬뽕|마라/, dishes: ['짜장면', '짬뽕', '간짜장', '짬뽕밥', '볶음밥', '탕수육'] },
  { re: /김밥/, dishes: ['김밥', '참치김밥', '라면', '떡볶이', '쫄면'] },
  { re: /분식|떡볶이/, dishes: ['떡볶이', '김밥', '라면', '순대', '쫄면', '오므라이스'] },
  { re: /돈까스|돈가스|카츠/, dishes: ['돼지등심돈가스', '치즈돈가스', '우동'] },
  { re: /우동/, dishes: ['우동', '어묵 우동'] },
  { re: /초밥|스시|회덮밥/, dishes: ['모듬초밥', '회덮밥', '알밥'] },
  { re: /(?<!본)죽/, dishes: ['전복죽', '호박죽', '채소죽'] },
  { re: /비빔밥|보리밥|한정식|쌈밥/, dishes: ['비빔밥', '돌솥비빔밥', '보리밥', '된장찌개'] },
  { re: /매운탕|아구|아귀/, dishes: ['우럭 매운탕', '대구 매운탕', '아귀찜'] },
  { re: /쌀국수|베트남/, dishes: ['쌀국수'] },
  { re: /카레/, dishes: ['카레라이스'] },
];

/** 분류가 "음식점 > 한식" 에서 끝나 더 단서가 없을 때 — 동네 한식당에 흔한 한 끼 */
const KOREAN_DEFAULT = ['김치찌개', '된장찌개', '제육볶음', '비빔밥'];

/**
 * 가게 이름·카카오 분류 → 찾아볼 일반 음식 이름 (순서대로, 최대 PLACE_DISH_LIMIT 의 여유분까지).
 * 이름에서 걸린 규칙 → 분류(마지막 단계부터)에서 걸린 규칙 → 분류가 그냥 "한식"이면 흔한 한식.
 * 카페·술집·패스트푸드처럼 단서가 없으면 빈 목록.
 */
export function placeDishQueries(name: string, placeCategory?: string): string[] {
  const out: string[] = [];
  const add = (list: string[]) => {
    for (const d of list) if (!out.includes(d)) out.push(d);
  };
  const nm = (name ?? '').normalize('NFKC');
  for (const r of PLACE_DISH_RULES) if (r.re.test(nm)) add(r.dishes);
  const levels = (placeCategory ?? '')
    .normalize('NFKC')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean);
  // 음식점이 아닌 곳(카페·편의점)은 보지 않는다
  if (levels.length && levels[0] !== '음식점') return out.slice(0, PLACE_DISH_LIMIT * 2);
  // 술집은 한 끼 식당이 아니라 이름 단서만 쓴다
  const isBar = levels.some((l) => /술집|호프|요리주점|이자카야|포장마차|와인바|칵테일/.test(l));
  if (!isBar) {
    for (const lv of [...levels.slice(1)].reverse()) for (const r of PLACE_DISH_RULES) if (r.re.test(lv)) add(r.dishes);
    if (out.length === 0 && levels.length === 2 && levels[1] === '한식') add(KOREAN_DEFAULT);
  }
  // 모자란 음식 이름을 건너뛸 여유를 두고 넉넉히 돌려준다 (로더가 PLACE_DISH_LIMIT 개까지만 싣는다)
  return out.slice(0, PLACE_DISH_LIMIT * 2);
}

/**
 * 일반 음식 → 이 가게 추정 메뉴. 값은 그대로(식약처 1인분)지만 이 가게의 값이 아니라 추정(estimated)이고,
 * 이유 한 줄에 "일반 식당 기준"임을 먼저 밝힌다. id 는 원래 id + PLACE_EST_ID_SUFFIX.
 */
export function toPlaceEstimate(dish: MenuItem): MenuItem {
  return {
    ...dish,
    id: dish.id.endsWith(PLACE_EST_ID_SUFFIX) ? dish.id : `${dish.id}${PLACE_EST_ID_SUFFIX}`,
    trust: 'estimated',
    servingNote: `이 가게 영양 정보가 아니라 일반 식당 기준으로 어림한 값이에요. ${dish.servingNote ?? ''}`.trim(),
    tags: [...(dish.tags ?? []), '일반 식당 기준'],
  };
}
