/**
 * 음식 갈래 — "무엇을 먹는지"로 메뉴를 나눈다 (밀리 식단에서 하루 세 끼를 서로 다른 갈래로 짜려고).
 * 샌드위치·버거·치즈듬뿍어니언은 매장은 달라도 전부 밀가루 빵이라 한 갈래(bread)로 본다 (2026-09-26 효님 피드백).
 * 전부 규칙 — 메뉴 이름 키워드 → 매장 힌트(브랜드·매장 종류) → 넓은 키워드 → 메뉴 분류 순서로 본다. React 의존 없음.
 */
import type { MenuCategory, StoreCategory } from './types';

export type FoodGroup =
  | 'bread' // 빵·샌드위치·버거·토스트·베이글·피자·랩
  | 'rice' // 밥·덮밥·도시락·김밥·주먹밥·볶음밥
  | 'noodle' // 라면·국수·파스타·우동·짜장
  | 'soup' // 국·탕·찌개·국밥
  | 'salad' // 샐러드·포케
  | 'protein' // 고기·치킨 단품
  | 'porridge' // 죽
  | 'bunsik' // 떡볶이·순대·어묵·만두
  | 'light' // 요거트·견과·고구마·계란 (가벼운 간식)
  | 'sweets' // 케이크·쿠키·도넛·과자 (디저트)
  | 'drink'
  | 'other';

/** 화면용 이름 */
export const FOOD_GROUP_LABEL: Record<FoodGroup, string> = {
  bread: '빵·샌드위치',
  rice: '밥',
  noodle: '면',
  soup: '국·찌개',
  salad: '샐러드',
  protein: '고기·치킨',
  porridge: '죽',
  bunsik: '분식',
  light: '가벼운 간식',
  sweets: '디저트',
  drink: '음료',
  other: '기타',
};

/** 문장 속 이름 ("아침에 빵을 골라서 점심은 밥으로 골랐어요") */
export const FOOD_GROUP_WORD: Record<FoodGroup, string> = {
  bread: '빵',
  rice: '밥',
  noodle: '면',
  soup: '국물 요리',
  salad: '샐러드',
  protein: '고기',
  porridge: '죽',
  bunsik: '분식',
  light: '가벼운 간식',
  sweets: '디저트',
  drink: '음료',
  other: '다른 메뉴',
};

/** 점심·저녁에 앞세우는 "제대로 된 한 끼" 갈래 */
export const REAL_MEAL_GROUPS: readonly FoodGroup[] = ['rice', 'noodle', 'soup', 'porridge', 'bunsik'];

/** 주 끼니(아침·점심·저녁)의 주 메뉴로는 권하지 않는 갈래 — 간식 칸에서만 */
export const NON_MAIN_GROUPS: readonly FoodGroup[] = ['sweets', 'drink'];

type Rule = string | RegExp;

/** 1단계 — 요리 이름이 분명한 키워드. 위에 있는 갈래가 먼저 (디저트 → 죽 → 면 → 국 → 밥 → 빵 → 샐러드 → 분식 → 가벼운 간식) */
const SPECIFIC: { group: FoodGroup; words: Rule[] }[] = [
  {
    group: 'sweets',
    words: [
      '케이크', '케익', '쿠키', '도넛', '도나쓰', '마카롱', '초콜릿', '초콜렛', '초코렛', '캔디', '사탕', '젤리', '티라미수', '타르트',
      '브라우니', '와플', '크로플', '츄로스', '카스텔라', '카스테라', '휘낭시에', '마들렌', '아이스크림', '빙수', '푸딩', '쉬폰',
      '크레이프', '호떡', '붕어빵', '약과', '과자', '머랭', '칩', /파이($|\()/,
    ],
  },
  { group: 'porridge', words: ['죽'] },
  { group: 'noodle', words: ['라면', '라멘', '우동', '국수', '파스타', '스파게티', '짬뽕', '짜장', '냉면', '쫄면', '소바', '비빔면', '컵면', '누들', /면$/] },
  { group: 'soup', words: ['국밥', '찌개', '전골', '해장국', '미역국', '북어국', '된장국', '육개장', '순두부', '수프', '스프', /탕$/, /국$/] },
  { group: 'rice', words: ['김밥', '주먹밥', '초밥', '덮밥', '비빔밥', '볶음밥', '도시락', '컵밥', '오므라이스', '카레라이스', '하이라이스', '리조또', '밥'] },
  {
    group: 'bread',
    words: [
      '샌드위치', '샌드', '버거', '토스트', '베이글', '파니니', '크루아상', '크로와상', '크라상', '꽈루아상', '피자', '핫도그', '브레드',
      '바게뜨', '바게트', '식빵', '치아바타', '머핀', '스콘', '페스츄리', '데니쉬', '고로케', '크로크', '브리또', '부리또', '타코',
      '퀘사디아', '프레즐', '꽈배기', '브리오슈', '소보루', '프랑스', '빵', /(^|[^크])랩/, /번$/,
    ],
  },
  { group: 'salad', words: ['샐러드', '포케', '보울', '샐러디'] },
  { group: 'bunsik', words: ['떡볶이', '떡볶기', '라볶이', '순대', '어묵', '오뎅', '튀김', '만두', '핫바', '떡꼬치'] },
  { group: 'light', words: ['요거트', '요구르트', '그릭', '견과', '너트', '바나나', '고구마', '구운란', '계란', '달걀', '과일', '프로틴바'] },
];

/** 3단계 — 넓은 키워드 (매장 힌트 뒤에 본다: 서브웨이 "로스트 치킨"은 치킨이 아니라 샌드위치) */
const GENERIC: { group: FoodGroup; words: Rule[] }[] = [
  { group: 'protein', words: ['치킨', '닭', '스테이크', '소시지', '삼겹', '목살', '수육', '보쌈', '족발', '불고기', '제육', '갈비', '훈제', '연어', '오리', '너겟', '텐더', '순살'] },
];

/** 매장 이름으로 매장 종류를 짐작 (기록에는 매장 종류가 없어서) */
const STORE_NAME_HINTS: { cat: StoreCategory; words: string[] }[] = [
  { cat: 'bakery', words: ['파리바게뜨', '뚜레쥬르', '베이커리', '제과', '빵집'] },
  { cat: 'cafe', words: ['스타벅스', '이디야', '메가', '컴포즈', '투썸', '빽다방', '할리스', '폴바셋', '카페', '커피'] },
  { cat: 'fastfood', words: ['맥도날드', '롯데리아', '버거킹', '맘스터치', 'kfc'] },
];

export interface FoodGroupInput {
  name: string;
  /** 메뉴 분류 (모르면 비워 둔다 — 기록에서 올 때) */
  category?: MenuCategory;
  /** 매장 이름 ("서브웨이 역삼역점") */
  storeName?: string;
  /** 매장 종류 (모르면 매장 이름으로 짐작) */
  storeCategory?: StoreCategory;
}

/** 대소문자·공백·기호 무시 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function hit(text: string, words: readonly Rule[]): boolean {
  return words.some((w) => (typeof w === 'string' ? text.includes(w) : w.test(text)));
}

function match(text: string, table: { group: FoodGroup; words: Rule[] }[]): FoodGroup | undefined {
  for (const t of table) if (hit(text, t.words)) return t.group;
  return undefined;
}

/** 메뉴 → 음식 갈래. 음료 분류는 늘 drink, 끝까지 모르면 other */
export function foodGroup(input: FoodGroupInput): FoodGroup {
  if (input.category === 'drink') return 'drink';
  const name = norm(input.name);
  const store = input.storeName ? norm(input.storeName) : '';
  const storeCat = input.storeCategory ?? STORE_NAME_HINTS.find((h) => h.words.some((w) => store.includes(w)))?.cat;

  // 1) 요리 이름이 분명하면 그걸로
  const specific = match(name, SPECIFIC);
  if (specific) return specific;
  // 2) 매장 힌트 — 서브웨이는 샌드위치, 본죽은 죽, 빵집은 빵, 카페 식사는 샌드위치류·카페 간식은 디저트
  if (store.includes('서브웨이') || store.includes('subway')) return input.category === 'salad' ? 'salad' : 'bread';
  if (store.includes('본죽') || store.includes('죽집')) return 'porridge';
  if (storeCat === 'bakery') return 'bread';
  if (storeCat === 'cafe' && input.category === 'meal') return 'bread';
  if (storeCat === 'cafe' && input.category === 'snack') return 'sweets';
  // 3) 넓은 키워드 (치킨·고기)
  const generic = match(name, GENERIC);
  if (generic) return generic;
  // 4) 메뉴 분류·매장 종류
  if (input.category === 'salad') return 'salad';
  if (storeCat === 'fastfood') return 'bread';
  if (input.category === 'snack') return storeCat === 'convenience' ? 'light' : 'sweets';
  return 'other';
}
