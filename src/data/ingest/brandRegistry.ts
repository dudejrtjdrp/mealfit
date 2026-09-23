/**
 * 공공데이터(식약처 전국통합식품영양성분정보) 인제스트용 브랜드 레지스트리.
 *
 * - `companyAliases`: 원본의 업체명·상호명·유통업체명을 normalizeCompany() 한 값과 **완전 일치**로만 비교한다.
 *   부분 일치는 쓰지 않는다 — "(주)비알코리아"(배스킨라빈스·던킨), "롯데지알에스"(롯데리아·엔제리너스),
 *   "에스피씨"/"파리크라상"(파리바게뜨·파스쿠찌·쉐이크쉑), "더본코리아", "본아이에프", "신세계푸드",
 *   "씨제이푸드빌" 처럼 한 법인이 여러 브랜드를 운영하는 경우는 오매칭을 막기 위해 일부러 넣지 않는다.
 * - `matchKeywords`: 앱에서 카카오 place_name → 브랜드를 알아볼 때 쓰는 키워드 (src/data 의 matchBrand).
 * - 배열 순서 = 용량 초과 시 남기는 우선순위. 기존 시드 12개가 먼저, 그 뒤가 주요 프랜차이즈.
 * - `processedOk`: 가공식품 DB(편의점 PB 등)에서 받아도 되는 브랜드. 카페 브랜드의 마트용 스틱커피처럼
 *   매장 메뉴가 아닌 제품이 섞이지 않도록 편의점만 true.
 */
import type { StoreCategory } from '../../domain/types';

export interface RegistryBrand {
  id: string;
  name: string;
  category: StoreCategory;
  matchKeywords: string[];
  companyAliases: string[];
  processedOk?: boolean;
  blurb?: string;
}

export const BRAND_REGISTRY: RegistryBrand[] = [
  // ── 기존 시드 12개 (brands.json) ──
  { id: 'gs25', name: 'GS25', category: 'convenience', matchKeywords: [], companyAliases: ['GS25', '지에스25', '지에스리테일', 'GS리테일'], processedOk: true },
  { id: 'cu', name: 'CU', category: 'convenience', matchKeywords: [], companyAliases: ['CU', '씨유', '비지에프리테일', 'BGF리테일'], processedOk: true },
  { id: 'seven_eleven', name: '세븐일레븐', category: 'convenience', matchKeywords: [], companyAliases: ['세븐일레븐', '코리아세븐', '7-ELEVEN'], processedOk: true },
  { id: 'starbucks', name: '스타벅스', category: 'cafe', matchKeywords: [], companyAliases: ['스타벅스', '스타벅스커피코리아', '에스씨케이컴퍼니', 'STARBUCKS'] },
  { id: 'mega', name: '메가MGC커피', category: 'cafe', matchKeywords: [], companyAliases: ['메가MGC커피', '메가엠지씨커피', '메가커피', '앤하우스'] },
  { id: 'ediya', name: '이디야커피', category: 'cafe', matchKeywords: [], companyAliases: ['이디야', '이디야커피', 'EDIYA'] },
  { id: 'compose', name: '컴포즈커피', category: 'cafe', matchKeywords: [], companyAliases: ['컴포즈커피', 'COMPOSECOFFEE'] },
  { id: 'subway', name: '서브웨이', category: 'fastfood', matchKeywords: [], companyAliases: ['서브웨이', '서브웨이코리아', 'SUBWAY'] },
  { id: 'salady', name: '샐러디', category: 'salad', matchKeywords: [], companyAliases: ['샐러디', 'SALADY'] },
  { id: 'paris_baguette', name: '파리바게뜨', category: 'bakery', matchKeywords: [], companyAliases: ['파리바게뜨', '파리바게트', 'PARISBAGUETTE'] },
  { id: 'bonjuk', name: '본죽', category: 'korean', matchKeywords: [], companyAliases: ['본죽'] },
  { id: 'mom_touch', name: '맘스터치', category: 'fastfood', matchKeywords: [], companyAliases: ['맘스터치', '맘스터치앤컴퍼니', '해마로푸드서비스'] },

  // ── 편의점 ──
  { id: 'emart24', name: '이마트24', category: 'convenience', matchKeywords: ['이마트24', 'EMART24', 'EMART 24'], companyAliases: ['이마트24', 'EMART24'], processedOk: true, blurb: '간편식과 간식을 골라보세요.' },

  // ── 카페 ──
  { id: 'twosome', name: '투썸플레이스', category: 'cafe', matchKeywords: ['투썸플레이스', 'A TWOSOME PLACE', 'TWOSOME PLACE'], companyAliases: ['투썸플레이스', 'ATWOSOMEPLACE'], blurb: '커피와 케이크, 디저트가 있어요.' },
  { id: 'hollys', name: '할리스', category: 'cafe', matchKeywords: ['할리스', 'HOLLYS'], companyAliases: ['할리스', '할리스커피', '할리스에프앤비', 'HOLLYS'], blurb: '커피와 음료, 베이커리가 있어요.' },
  { id: 'paul_bassett', name: '폴바셋', category: 'cafe', matchKeywords: ['폴바셋', 'PAUL BASSETT'], companyAliases: ['폴바셋', '엠즈씨드', 'PAULBASSETT'], blurb: '커피와 아이스크림이 있어요.' },
  { id: 'coffee_bean', name: '커피빈', category: 'cafe', matchKeywords: ['커피빈', 'COFFEE BEAN'], companyAliases: ['커피빈', '커피빈코리아'], blurb: '커피와 티 음료가 있어요.' },
  { id: 'tom_n_toms', name: '탐앤탐스', category: 'cafe', matchKeywords: ['탐앤탐스', 'TOM N TOMS', 'TOMNTOMS'], companyAliases: ['탐앤탐스', 'TOMNTOMS'], blurb: '커피와 프레즐이 있어요.' },
  { id: 'paik', name: '빽다방', category: 'cafe', matchKeywords: ['빽다방'], companyAliases: ['빽다방'], blurb: '큰 사이즈 음료가 많아요.' },
  { id: 'the_venti', name: '더벤티', category: 'cafe', matchKeywords: ['더벤티', 'THE VENTI', 'THEVENTI'], companyAliases: ['더벤티', 'THEVENTI'], blurb: '큰 사이즈 커피와 음료가 있어요.' },
  { id: 'angelinus', name: '엔제리너스', category: 'cafe', matchKeywords: ['엔제리너스', 'ANGELINUS'], companyAliases: ['엔제리너스'], blurb: '커피와 디저트가 있어요.' },
  { id: 'pascucci', name: '파스쿠찌', category: 'cafe', matchKeywords: ['파스쿠찌', 'PASCUCCI'], companyAliases: ['파스쿠찌'], blurb: '커피와 젤라또가 있어요.' },
  { id: 'gongcha', name: '공차', category: 'cafe', matchKeywords: ['공차', 'GONG CHA', 'GONGCHA'], companyAliases: ['공차', '공차코리아', 'GONGCHA'], blurb: '밀크티와 티 음료가 있어요.' },
  { id: 'baskin', name: '배스킨라빈스', category: 'cafe', matchKeywords: ['배스킨라빈스', 'BASKIN ROBBINS', 'BASKINROBBINS'], companyAliases: ['배스킨라빈스', 'BASKINROBBINS'], blurb: '아이스크림과 음료가 있어요.' },
  { id: 'dunkin', name: '던킨', category: 'bakery', matchKeywords: ['던킨', 'DUNKIN'], companyAliases: ['던킨', '던킨도너츠', 'DUNKIN'], blurb: '도넛과 커피가 있어요.' },
  { id: 'smoothie_king', name: '스무디킹', category: 'cafe', matchKeywords: ['스무디킹', 'SMOOTHIE KING'], companyAliases: ['스무디킹', '스무디킹코리아'], blurb: '스무디와 주스가 있어요.' },

  // ── 버거·샌드위치 ──
  { id: 'mcdonalds', name: '맥도날드', category: 'fastfood', matchKeywords: ['맥도날드', "MCDONALD'S", 'MCDONALDS'], companyAliases: ['맥도날드', '한국맥도날드', 'MCDONALDS'], blurb: '버거와 사이드, 음료가 있어요.' },
  { id: 'burger_king', name: '버거킹', category: 'fastfood', matchKeywords: ['버거킹', 'BURGER KING', 'BURGERKING'], companyAliases: ['버거킹', '비케이알', 'BURGERKING'], blurb: '버거와 사이드, 음료가 있어요.' },
  { id: 'lotteria', name: '롯데리아', category: 'fastfood', matchKeywords: ['롯데리아', 'LOTTERIA'], companyAliases: ['롯데리아', 'LOTTERIA'], blurb: '버거와 사이드, 음료가 있어요.' },
  { id: 'kfc', name: 'KFC', category: 'fastfood', matchKeywords: ['KFC', '케이에프씨'], companyAliases: ['KFC', '케이에프씨', '케이에프씨코리아', '한국케이에프씨'], blurb: '치킨과 버거가 있어요.' },
  { id: 'no_brand_burger', name: '노브랜드버거', category: 'fastfood', matchKeywords: ['노브랜드버거', 'NO BRAND BURGER'], companyAliases: ['노브랜드버거'], blurb: '버거와 사이드가 있어요.' },
  { id: 'frank_burger', name: '프랭크버거', category: 'fastfood', matchKeywords: ['프랭크버거', 'FRANK BURGER'], companyAliases: ['프랭크버거'], blurb: '버거와 사이드가 있어요.' },
  { id: 'isaac', name: '이삭토스트', category: 'fastfood', matchKeywords: ['이삭토스트', 'ISAAC TOAST'], companyAliases: ['이삭토스트', '이삭'], blurb: '토스트와 음료가 있어요.' },

  // ── 치킨·피자 ──
  { id: 'bbq', name: 'BBQ', category: 'fastfood', matchKeywords: ['BBQ치킨', 'BBQ 치킨', '비비큐'], companyAliases: ['BBQ', '비비큐', '제너시스비비큐'], blurb: '치킨과 사이드가 있어요.' },
  { id: 'bhc', name: 'bhc', category: 'fastfood', matchKeywords: ['BHC', '비에이치씨'], companyAliases: ['BHC', '비에이치씨'], blurb: '치킨과 사이드가 있어요.' },
  { id: 'kyochon', name: '교촌치킨', category: 'fastfood', matchKeywords: ['교촌치킨', '교촌'], companyAliases: ['교촌치킨', '교촌', '교촌에프앤비'], blurb: '치킨과 사이드가 있어요.' },
  { id: 'goobne', name: '굽네치킨', category: 'fastfood', matchKeywords: ['굽네치킨', '굽네'], companyAliases: ['굽네치킨', '굽네', '지앤푸드'], blurb: '오븐에 구운 치킨이 있어요.' },
  { id: 'nene', name: '네네치킨', category: 'fastfood', matchKeywords: ['네네치킨'], companyAliases: ['네네치킨', '혜인식품'], blurb: '치킨과 사이드가 있어요.' },
  { id: 'dominos', name: '도미노피자', category: 'fastfood', matchKeywords: ['도미노피자', "DOMINO'S", 'DOMINOS'], companyAliases: ['도미노피자', '청오디피케이', 'DOMINOS'], blurb: '피자와 사이드가 있어요.' },
  { id: 'pizza_hut', name: '피자헛', category: 'fastfood', matchKeywords: ['피자헛', 'PIZZA HUT', 'PIZZAHUT'], companyAliases: ['피자헛', '한국피자헛', 'PIZZAHUT'], blurb: '피자와 사이드가 있어요.' },
  { id: 'papa_johns', name: '파파존스', category: 'fastfood', matchKeywords: ['파파존스', "PAPA JOHN'S", 'PAPAJOHNS'], companyAliases: ['파파존스', '한국파파존스', 'PAPAJOHNS'], blurb: '피자와 사이드가 있어요.' },
  { id: 'mr_pizza', name: '미스터피자', category: 'fastfood', matchKeywords: ['미스터피자', 'MR.PIZZA', 'MR PIZZA'], companyAliases: ['미스터피자'], blurb: '피자와 사이드가 있어요.' },

  // ── 베이커리 ──
  { id: 'tous_les_jours', name: '뚜레쥬르', category: 'bakery', matchKeywords: ['뚜레쥬르', 'TOUS LES JOURS'], companyAliases: ['뚜레쥬르', 'TOUSLESJOURS'], blurb: '빵과 케이크, 샌드위치가 있어요.' },

  // ── 한식·분식·도시락 ──
  { id: 'hansot', name: '한솥도시락', category: 'korean', matchKeywords: ['한솥도시락', '한솥'], companyAliases: ['한솥', '한솥도시락'], blurb: '따뜻한 도시락을 골라보세요.' },
  { id: 'bondosirak', name: '본도시락', category: 'korean', matchKeywords: ['본도시락'], companyAliases: ['본도시락'], blurb: '든든한 도시락이 있어요.' },
  { id: 'kimgane', name: '김가네', category: 'korean', matchKeywords: ['김가네'], companyAliases: ['김가네'], blurb: '김밥과 분식이 있어요.' },
  { id: 'barda_kim', name: '바르다김선생', category: 'korean', matchKeywords: ['바르다김선생'], companyAliases: ['바르다김선생'], blurb: '김밥과 분식이 있어요.' },
  { id: 'gobongmin', name: '고봉민김밥', category: 'korean', matchKeywords: ['고봉민김밥'], companyAliases: ['고봉민김밥', '고봉민김밥인'], blurb: '김밥과 분식이 있어요.' },
  { id: 'yupdduk', name: '엽기떡볶이', category: 'korean', matchKeywords: ['엽기떡볶이', '동대문엽기떡볶이'], companyAliases: ['엽기떡볶이', '동대문엽기떡볶이', '핫시즈너'], blurb: '떡볶이와 사이드가 있어요.' },
  { id: 'sinjeon', name: '신전떡볶이', category: 'korean', matchKeywords: ['신전떡볶이'], companyAliases: ['신전떡볶이', '신전푸드시스'], blurb: '떡볶이와 분식이 있어요.' },
  { id: 'jaws', name: '죠스떡볶이', category: 'korean', matchKeywords: ['죠스떡볶이'], companyAliases: ['죠스떡볶이'], blurb: '떡볶이와 분식이 있어요.' },

  // ── 샐러드 ──
  { id: 'poke_all_day', name: '포케올데이', category: 'salad', matchKeywords: ['포케올데이', 'POKE ALL DAY'], companyAliases: ['포케올데이'], blurb: '포케와 샐러드가 있어요.' },

  // ── 2026-09-23 공공데이터(음식) 매칭 안 된 업체명 상위에서 추가한 단일 브랜드 체인 ──
  { id: 'coffee_banhada', name: '커피에반하다', category: 'cafe', matchKeywords: ['커피에반하다'], companyAliases: ['커피에반하다'], blurb: '커피와 음료가 있어요.' },
  { id: 'yogerpresso', name: '요거프레소', category: 'cafe', matchKeywords: ['요거프레소', 'YOGERPRESSO'], companyAliases: ['요거프레소'], blurb: '요거트와 음료가 있어요.' },
  { id: 'the_liter', name: '더리터', category: 'cafe', matchKeywords: ['더리터', 'THE LITER'], companyAliases: ['더리터'], blurb: '큰 사이즈 음료가 있어요.' },
  { id: 'banapresso', name: '바나프레소', category: 'cafe', matchKeywords: ['바나프레소', 'BANAPRESSO'], companyAliases: ['바나프레소'], blurb: '커피와 음료가 있어요.' },
  { id: 'palgongtea', name: '팔공티', category: 'cafe', matchKeywords: ['팔공티'], companyAliases: ['팔공티'], blurb: '밀크티와 티 음료가 있어요.' },
  { id: 'coffeebay', name: '커피베이', category: 'cafe', matchKeywords: ['커피베이', 'COFFEEBAY'], companyAliases: ['커피베이'], blurb: '커피와 음료가 있어요.' },
  { id: 'coffeemama', name: '커피마마', category: 'cafe', matchKeywords: ['커피마마'], companyAliases: ['커피마마'], blurb: '커피와 음료가 있어요.' },
  { id: 'caffebene', name: '카페베네', category: 'cafe', matchKeywords: ['카페베네', 'CAFFEBENE'], companyAliases: ['카페베네'], blurb: '커피와 디저트가 있어요.' },
  { id: 'dalkomm', name: '달콤커피', category: 'cafe', matchKeywords: ['달콤커피', 'DALKOMM'], companyAliases: ['달콤', '달콤커피'], blurb: '커피와 음료가 있어요.' },
  { id: 'im_a_liter', name: '아임일리터', category: 'cafe', matchKeywords: ['아임일리터'], companyAliases: ['아임일리터'], blurb: '큰 사이즈 음료가 있어요.' },
  { id: 'droptop', name: '드롭탑', category: 'cafe', matchKeywords: ['드롭탑', 'DROPTOP'], companyAliases: ['드롭탑', '카페드롭탑'], blurb: '커피와 디저트가 있어요.' },
  { id: 'coffee_nie', name: '커피니', category: 'cafe', matchKeywords: ['커피니'], companyAliases: ['커피니', '커피:니'], blurb: '커피와 음료가 있어요.' },
  { id: 'jijeonghwan', name: '지정환피자', category: 'fastfood', matchKeywords: ['지정환피자'], companyAliases: ['지정환피자'], blurb: '피자와 사이드가 있어요.' },
  { id: 'pizza7', name: '7번가피자', category: 'fastfood', matchKeywords: ['7번가피자'], companyAliases: ['7번가피자', '칠번가피자'], blurb: '피자와 사이드가 있어요.' },
  { id: 'pizza_maru', name: '피자마루', category: 'fastfood', matchKeywords: ['피자마루'], companyAliases: ['피자마루'], blurb: '피자와 사이드가 있어요.' },
  { id: 'pizza_paneun', name: '피자파는집', category: 'fastfood', matchKeywords: ['피자파는집'], companyAliases: ['피자파는집'], blurb: '피자와 사이드가 있어요.' },
  { id: 'alvolo', name: '피자알볼로', category: 'fastfood', matchKeywords: ['피자알볼로', 'ALVOLO'], companyAliases: ['피자알볼로', '알볼로에프앤씨'], blurb: '피자와 사이드가 있어요.' },
];

export const REGISTRY_BY_ID = new Map(BRAND_REGISTRY.map((b) => [b.id, b]));
