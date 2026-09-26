/**
 * 메뉴·매장 → AI 대표 이미지 키 (2026-09-26 효님 결정: 실사진을 받을 경로가 없어 AI로 만든 음식·매장 종류별 이미지를 넣는다).
 * 이미지는 assets/food/<key>.jpg — 그 가게·그 메뉴의 실제 사진이 아니라 종류별 예시다.
 * 규칙은 앞에서부터. 음료 메뉴에는 음료 키만, 음식 메뉴에는 음식 키만 쓴다. 없으면 분류 폴백.
 */
import type { MenuCategory, StoreCategory } from '../domain/types';

/** [키, 이름 정규식, 음료 여부] */
export const FOOD_IMAGE_RULES: readonly [string, RegExp, boolean][] = [
  ['bubble_tea', /버블|펄|타피오카|밀크티/, true],
  ['frappe', /프라푸치노|프라페|플랫치노|블렌디드|쉐이크|쉑|셰이크|프로스트|그라니따|블라스트|칠러|스무디/, true],
  ['smoothie_fruit', /딸기.*(스무디|주스)|망고.*(스무디|주스)|블루베리.*(스무디|주스)/, true],
  ['ade', /에이드|레모네이드|탄산수|스파클링/, true],
  ['cola', /콜라|사이다|소다|진저에일|환타|펩시|탄산|제로.*(콜라|사이다)|웰치스|밀키스|맥콜/, true],
  ['iced_tea', /아이스티|아이스 티/, true],
  ['fruit_tea', /자몽.*(티|차)|유자|레몬.*(티|차)|청귤|과실차|허니.*티|생강차|대추차|오미자|모과|꿀차/, true],
  ['green_tea_latte', /말차|녹차.*라떼|그린티.*라떼|그린.*밀크/, true],
  ['tea', /녹차|쌍화차|식혜|콤부차|홍차|얼그레이|캐모마일|페퍼민트|루이보스|히비스커스|자스민|보리차|옥수수차|둥굴레|헛개|티$|티 |차$|블렌드/, true],
  ['choco', /초코라떼|초콜릿 라떼|핫초코|초콜릿$|코코아|초코 라떼|핫 초콜릿/, true],
  ['grain_latte', /곡물|미숫가루|이곡|12곡|고구마 라떼|고구마라떼|흑임자|쑥 라떼|쑥라떼|단호박 라떼/, true],
  ['cold_brew', /콜드 ?브루|더치(?!즈)/, true],
  ['americano', /아메리카노|에스프레소|롱블랙|드립|브루 커피|리카노|블랙 커피|커피$/, true],
  ['latte', /라떼|라테|카푸치노|마키아또|마끼아또|마끼야또|아포가토|믹스커피|모카|플랫화이트|카페오레|슈페너|아인슈페너|돌체|바닐라빈/, true],
  ['juice', /주스|쥬스|착즙|과즙|100%|오렌지|사과즙|포도즙|토마토주스|ABC/, true],
  ['banana_milk', /바나나맛 ?우유|딸기맛 ?우유|초코 ?우유|커피 ?우유|가공유|맛우유/, true],
  ['yogurt_drink', /요구르트|요거트.*(드링크|음료|마시는)|야쿠르트|불가리스|윌|액티비아|요플레.*드링크|마시는/, true],
  ['protein_drink', /프로틴|단백질.*(음료|드링크|쉐이크)|셀렉스|하이뮨/, true],
  ['soy_milk', /두유|아몬드 ?브리즈|오트 ?밀크|귀리.*음료/, true],
  ['milk', /우유|밀크$|MILK/, true],
  ['energy_drink', /에너지|핫식스|레드불|몬스터|비타|이온|포카리|파워에이드|게토레이|토레타|제로.*음료|음료$|워터|생수|물$/, true],
  ['liquor', /맥주|소주|막걸리|와인|하이볼|사케|위스키/, true],
  ['bingsu', /빙수/, false],
  ['ice_cream', /아이스크림|젤라또|소프트콘|(?<!팝)콘$|파르페|선데|빙수|쮸쮸바|아이스바|하드|샤베트|소르베|빙과/, false],
  ['cake', /케이크|케익|티라미수|롤케|치즈케|무스|쇼콜라|카스텔라|파운드/, false],
  ['tart', /타르트|에그타르트|파이$|파이 /, false],
  ['macaron', /마카롱|다쿠아즈|휘낭시에|마들렌|피낭시에/, false],
  ['donut', /도넛|도나쓰|던킨|크룰러|꽈배기|츄러스/, false],
  ['waffle', /와플|크로플|팬케이크|핫케이크/, false],
  ['cookie', /쿠키|슈$|슈크레|츄러스|츄로스|비스킷|크래커|브라우니|브러우니|스콘|비스코티|사브레/, false],
  ['chocolate', /초콜릿|초코바|초코칩|가나|킷캣|트윅스|스니커즈|페레로/, false],
  ['candy_jelly', /젤리|사탕|캔디|껌|마이쮸|하리보|구미|캬라멜|카라멜$/, false],
  ['chips', /칩$|칩스|감자칩|새우깡|포테토|프링글스|꼬북|스낵|팝콘|과자|나초|강정$|뻥튀기/, false],
  ['rice_cake', /떡$|떡 |인절미|송편|경단|가래떡|백설기|절편|찹쌀떡|모찌|찰떡|약과|한과|양갱|호떡|떡케이크|개피떡|꿀떡|시루떡/, false],
  ['yogurt', /요거트|요구르트|그릭|그래놀라|요플레/, false],
  ['fruit', /바나나|사과|딸기$|포도$|귤$|과일|망고$|수박|참외|키위|블루베리$|토마토$|방울토마토|컵과일|샤인머스켓/, false],
  ['sweet_potato', /고구마$|군고구마|찐고구마|감자$|찐감자|옥수수$|찰옥수수|단호박$|밤$|군밤/, false],
  ['nuts', /견과|아몬드$|호두|땅콩|캐슈|피스타치오|믹스넛/, false],
  ['egg', /구운란|맥반석|삶은 ?달걀|삶은 ?계란|훈제란|반숙란|구운 ?계란|계란$|달걀$/, false],
  ['protein_bar', /프로틴바|단백질바|에너지바|그래놀라바|시리얼바|바$/, false],
  ['cereal', /시리얼|콘푸|오트밀|뮤즐리|그래놀라$/, false],
  ['croissant', /크루아상|크라상|페스츄리|페스트리|퀸아망|크로와상|크로아상|페이스트리|데니쉬|뺑오/, false],
  ['bagel', /베이글/, false],
  ['toast', /토스트/, false],
  ['sandwich', /샌드위치|샌드$|써브|서브웨이|파니니|클럽|BLT|햄에그|에그마요|카츠산도|산도/, false],
  ['hotdog', /핫도그|콘도그|소시지빵/, false],
  ['muffin', /머핀|컵케이크/, false],
  ['baguette', /바게트|프레즐|바게뜨|치아바타|깜빠뉴|깜바뉴|캄파뉴|사워도우|호밀빵|통밀빵|포카치아|브레첼|프레첼/, false],
  ['sweet_bun', /단팥|소보로|크림빵|슈크림|곰보|모카번|카스테라|앙버터|꽈배기|찹쌀도넛|맘모스|고로케|크로켓|피자빵/, false],
  ['bread', /빵|식빵|브레드|번$|모닝롤|롤$|밤식빵|버터롤/, false],
  ['gukbap', /국밥|순대국|순댓국/, false],
  ['seolleongtang', /설렁탕|곰탕|도가니탕|꼬리곰탕|사골|갈비탕|떡국|만둣국|만두국|떡만둣국/, false],
  ['samgyetang', /삼계탕|백숙|닭곰탕|오리탕/, false],
  ['haejangguk', /해장국|감자탕|뼈다귀|육개장|추어탕|선지|우거지|내장|곱창전골|닭개장/, false],
  ['kimchi_jjigae', /김치찌개|김치 찌개|부대찌개|김치찜|고추장찌개|짜글이|동태찌개|고등어찌개|조기찌개/, false],
  ['doenjang_jjigae', /된장찌개|청국장|된장국|강된장/, false],
  ['sundubu', /순두부/, false],
  ['seafood_stew', /매운탕|해물탕|꽃게탕|알탕|대구탕|복국|복어|지리|해물전골|연포탕|낙지전골/, false],
  ['jeongol', /전골|샤브|스키야키|밀푀유/, false],
  ['soup', /국$|국 |탕$|탕 |스프|수프|미역국|콩나물국|북엇국|황태|계란국|어묵탕|오뎅탕/, false],
  ['bibimbap', /비빔밥|돌솥|산채|열무.*밥|꼬막.*밥|회덮밥|알밥|육회비빔/, false],
  ['fried_rice', /볶음밥|필라프|오므라이스|나시고랭|김치밥|새우밥|카오팟/, false],
  ['curry', /카레|커리/, false],
  ['rice_bowl', /덮밥|동$|규동|사케동|가츠동|부타동|텐동|오야코|제육덮|불고기덮|마파|라이스볼|포케볼|웜볼/, false],
  ['jeyuk', /제육|두루치기|오징어볶음|낙지볶음|쭈꾸미|주꾸미|불백|고추장불고기|오삼/, false],
  ['bulgogi', /불고기|너비아니|떡갈비|장조림/, false],
  ['galbi_jjim', /갈비찜|찜닭|닭찜|닭볶음탕|닭도리탕|안동찜|등갈비|아귀찜|해물찜|김치찜|돼지.*찜|보쌈|족발|수육/, false],
  ['grill_meat', /삼겹|목살|갈비$|갈비 |항정|구이$|숯불|생고기|고기구이|LA갈비|양념갈비|돼지갈비|소갈비|차돌|대패|곱창|막창|대창|닭갈비/, false],
  ['fish', /고등어|조기|갈치|삼치|꽁치|임연수|가자미|생선|연어구이|장어|굴비|코다리|조림$|동태/, false],
  ['dosirak', /도시락|정식|백반|한상|반상|밥상|한정식/, false],
  ['gimbap', /김밥|꼬마김밥|충무/, false],
  ['triangle_kimbap', /삼각김밥|주먹밥|유부초밥|무스비|스팸.*밥|주먹/, false],
  ['porridge', /죽$|죽 |리조또|리소토|누룽지|오트밀죽|미음/, false],
  ['rice', /밥$|공기밥|쌀밥|현미|잡곡|흑미|햇반|오곡|콩밥|귀리밥|곤드레/, false],
  ['jjajang', /짜장|자장|간짜장|쟁반짜장/, false],
  ['jjamppong', /짬뽕|우육면|탄탄|마라탕|마라/, false],
  ['naengmyeon', /냉면|밀면|막국수|메밀|소바|냉소면|콩국수|물회/, false],
  ['ramyeon', /라면|라멘|컵라면|큰사발|신라면|진라면|너구리|짜파|불닭|왕뚜껑|육개장.*사발|사발면|봉지면|멸치.*국수|해물볶음면|볶음면|누들/, false],
  ['udon', /우동|쫄면|소면|중면|면$|가락국수|칼국수|수제비|잔치국수|국수|쌀국수|포$|분짜|야끼소바|잡채/, false],
  ['pasta', /파스타|스파게티|까르보|알리오|봉골레|라자냐|뇨끼|펜네|로제|크림.*면|토마토.*면|마카로니/, false],
  ['tteokbokki', /떡볶이|떡뽁이|라볶이|떡튀순|로제떡|YOPOKKI/, false],
  ['sundae', /순대$|순대 |찹쌀순대/, false],
  ['fishcake', /어묵|오뎅/, false],
  ['mandu', /만두|교자|딤섬|샤오롱|포자|왕만두|군만두|물만두/, false],
  ['jeon', /전$|전 |부침|빈대떡|파전|김치전|동그랑땡|전병|육전|녹두/, false],
  ['twigim', /튀김|야채튀김|오징어튀김|김말이|고로케|크로켓/, false],
  ['burger', /버거|와퍼|싸이|빅맥|불고기버거|치즈버거|햄버거/, false],
  ['fries', /감자튀김|프렌치프라이|프라이$|웨지감자|해쉬브라운|해시브라운|케이준|치즈스틱|어니언링|너겟|텐더|치킨너겟|팝콘치킨/, false],
  ['pizza', /피자|씬|팬 ?\(|골드링|치즈롤|스크린|도우|오리지널|크러스트|하와이언|페퍼로니|고르곤졸라|파파스|치즈링/, false],
  ['fried_chicken', /치킨|후라이드|양념치킨|닭강정|닭튀김|윙|봉$|순살|강정$|황금올리브|허니콤보|교촌|반마리|한마리|마리/, false],
  ['roast_chicken', /로스트|구운 ?치킨|오븐.*치킨|전기구이|바베큐|BBQ|립$|바비큐/, false],
  ['chicken_breast', /닭가슴살|닭안심|치킨브레스트|훈제 ?닭|슬라이스.*닭/, false],
  ['steak', /스테이크|함박|햄버그|미트볼|떡갈비/, false],
  ['tonkatsu', /돈까스|돈가스|카츠|커틀릿|치킨가스|생선가스|치즈까스|멘치/, false],
  ['burrito', /부리또|브리또|타코|퀘사디아|랩$|랩 |또띠아|케밥|나초/, false],
  ['sausage', /소시지|부어스트|윈너|소세지|후랑크|프랑크|비엔나|햄$|스팸|베이컨/, false],
  ['sushi', /초밥|스시|사시미|회$|연어$|롤$|캘리포니아|군함|유부.*초밥/, false],
  ['chinese', /탕수육|깐풍|유린기|양장피|팔보채|꿔바로우|멘보샤|고추잡채|마파두부|칠리새우|크림새우/, false],
  ['salad', /샐러드|코울슬로|샐러디|포케|콥|시저|그린|리코타|닭가슴살.*샐/, false],
  ['kimchi', /김치$|김치 |깍두기|겉절이|석박지|총각|갓김치|열무김치|동치미|백김치|파김치|나박/, false],
  ['namul', /나물|무침|생채|볶음$|장아찌|조림|샐러드$|숙주|시금치|콩나물$|멸치볶음|어묵볶음|진미채|잡채/, false],
  ['tofu', /두부|연두부|유부/, false],
  ['egg_dish', /달걀말이|계란말이|계란찜|달걀찜|스크램블|오믈렛|에그$|계란후라이|달걀후라이|에그.*베네딕트/, false],
  ['dumpling_soup', /수제비/, false],
  ['cheese', /치즈$|모짜렐라|체다|까망베르|리코타$|스트링/, false],
  ['sauce', /소스|드레싱|양념$|케첩|마요네즈$|잼$|시럽|꿀$/, false],
  ['supplement', /홍삼|추출액|진액|알부민|비타민|유산균|영양제|정$|환$|캡슐|분말|엑기스|즙$/, false],
];

export const FOOD_IMAGE_FALLBACK: Record<MenuCategory, string> = {
  drink: 'drink_generic',
  meal: 'meal_generic',
  snack: 'snack_generic',
  salad: 'salad',
  side: 'side_generic',
};

/** 메뉴 이름·분류 → 이미지 키 */
export function foodImageKey(menu: { name: string; category: MenuCategory }): string {
  const drink = menu.category === 'drink';
  for (const [key, re, isDrink] of FOOD_IMAGE_RULES) {
    if (isDrink !== drink) continue;
    if (re.test(menu.name)) return key;
  }
  return FOOD_IMAGE_FALLBACK[menu.category] ?? 'meal_generic';
}

/** 매장 이름·카카오 분류 단서 → 매장 이미지 키 (앞에서부터) */
const STORE_IMAGE_RULES: [string, RegExp][] = [
  ['store_chicken', /치킨|통닭|닭강정|BBQ|교촌|굽네|bhc|네네|페리카나|처갓집|호식이|푸라닭|노랑통닭/i],
  ['store_pizza', /피자/],
  ['store_gukbap', /국밥|순대|해장국|설렁탕|곰탕|감자탕|국수|칼국수|탕$/],
  ['store_meat', /고기|삼겹|갈비|곱창|막창|숯불|정육|육류|족발|보쌈/],
  ['store_chinese', /중식|중국|짜장|짬뽕|마라|반점|차이나|홍콩/],
  ['store_japanese', /일식|초밥|스시|라멘|돈까스|돈가스|우동|이자카야|덮밥|규동/],
  ['store_bunsik', /분식|떡볶이|김밥|김가네|죠스|엽기|신전/],
  ['store_dessert', /디저트|아이스크림|배스킨|도넛|던킨|빙수|설빙|케이크|와플|제과/],
  ['store_western', /양식|파스타|이탈리|스테이크|레스토랑|브런치|멕시|타코/],
  ['store_salad', /샐러드|포케|샐러디|써브웨이|서브웨이/],
  ['store_fastfood', /햄버거|버거|맥도날드|롯데리아|KFC|패스트푸드/i],
  ['store_bakery', /베이커리|제과|빵|파리바게뜨|뚜레쥬르|성심당/],
  ['store_cafe', /카페|커피|티$|다방|스타벅스|이디야|메가|컴포즈|빽다방|공차/],
  ['store_convenience', /편의점|GS25|CU|세븐일레븐|이마트24|미니스톱/i],
];

const STORE_CATEGORY_IMAGE: Record<StoreCategory, string> = {
  convenience: 'store_convenience',
  cafe: 'store_cafe',
  salad: 'store_salad',
  korean: 'store_korean',
  bakery: 'store_bakery',
  fastfood: 'store_fastfood',
  other: 'store_other',
};

/** 매장 → 이미지 키. 이름·브랜드 이름·카카오 분류에서 단서를 찾고, 없으면 매장 분류로 */
export function storeImageKey(store: { category?: StoreCategory; name?: string; brandName?: string; placeCategory?: string }): string {
  const hay = [store.brandName, store.name, store.placeCategory?.split('>').slice(1).join(' ')].filter(Boolean).join(' ');
  if (hay) for (const [key, re] of STORE_IMAGE_RULES) if (re.test(hay)) return key;
  return STORE_CATEGORY_IMAGE[store.category ?? 'other'];
}
