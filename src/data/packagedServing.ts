/**
 * 여러 번 나눠 먹는 대용량 가공식품 포장(우유 1.8 L·아메리카노 1 L·짜장면 밀키트 1,132 g·라면스낵 360 g …)을
 * 식약처 1회 섭취참고량 만큼으로 바꾼다 — 로드·매핑 단계 순수 변환 (2026-09-26 효님: "식 표준 한 번 섭취량으로 해").
 *
 * 대상: domain/nonMeal 이 'bulk'(대용량)로 보는 메뉴만 — 매장 메뉴로 들어온 가공식품, 시판 제품 번들(pkg-), 서버 제품 행.
 * 이름으로 식품유형을 정할 수 있을 때만 바꾸고(PACK_RULES), 믹스·파우더·반죽·베이스·통조림처럼 정할 수 없거나
 * 조리 재료인 것은 그대로 둔다 (여전히 'bulk' 라 추천에서는 빠진다).
 *
 * 숫자를 지어내지 않는다: 포장 전체의 공식 영양 × (참고량 ÷ 포장 중량), trust 'estimated',
 * servingNote "전체 1.8 L 제품 · 식약처 1회 섭취참고량(우유 200 ml) 기준 추정이에요".
 * 새 id 는 `${원래 id}-serving` (perServing 과 같은 규칙) — 원래 id 는 호출 쪽이 계속 찾을 수 있게 남긴다.
 */
import { nonMealKind } from '../domain/nonMeal';
import type { MenuItem } from '../domain/types';
import { scaleNutrients } from './perPortion';

export const PACK_SERVING_ID_SUFFIX = '-serving';

type Unit = 'g' | 'ml';
interface PackRef {
  /** [별표 3] 식품유형 이름 (servingNote 에 그대로) */
  label: string;
  amount: number;
  /** 참고량 단위. 'either' 는 표에 "ml(g)"·"ml 또는 g" 로 적힌 것 — 포장 단위를 그대로 쓴다 */
  unit: Unit | 'either';
}

/**
 * 이름 → 식약처 「식품등의 표시기준」 [별표 3] 1회 섭취참고량 (perServing.MFDS_SERVING_REF_SOURCE, 2026-09-26 확인).
 * 앞선 규칙이 이긴다. 옮긴 값: 8 면류(생면·숙면 200 g, 건면(당면 제외) 100 g, 유탕면 봉지 120 g·용기 80 g),
 * 1 과자 30 g·빵류 70 g·떡류 100 g, 2 아이스크림류 100 ml(g), 9 음료류(커피 240 ml, 두유류 200 ml, 과채·혼합음료 200 ml),
 * 13 카레 레토르트 200 g, 14 기타김치 40 g, 16 시리얼 30 g·누룽지 60 g, 17 양념육·갈비가공품 100 g·분쇄가공육제품 50 g·
 * 기타 식육함유가공품 50 g·햄·소시지 30 g, 20 어묵 30 g, 19 우유 200 ml·기타 발효유 액상 150 ml·호상 100 g, 23 밥 210 g·국·탕 250 ml(g)·찌개 200 ml(g)·
 * 죽 250 ml(g)·스프 150 ml(g)·만두 150 g·햄버거·샌드위치 150 g
 */
const R = (label: string, amount: number, unit: PackRef['unit']): PackRef => ({ label, amount, unit });
/** 조리 재료·가루·반죽처럼 한 번 먹는 양을 정할 수 없는 것 — 바꾸지 않는다 */
const SKIP_RE = /믹스|파우더|가루|분말|반죽|생지|베이스|농축|엑기스|추출물|퓨레|원액|시럽|소스|양념|통조림|참치|꽁치|고등어|젓갈|게장|오일|버터$|사리$|중화면/;
const PACK_RULES: [RegExp, PackRef | ((unit: Unit, name: string) => PackRef)][] = [
  [/아이스크림|샤벳|셔벗|젤라또/, R('아이스크림류', 100, 'either')],
  [/라면\s*스낵|뿌셔|부셔|스낵|과자|칩$|쿠키/, R('과자', 30, 'g')],
  [/우유$|우유\s|밀크$/, R('우유', 200, 'ml')],
  [/요거트|요구르트|발효유|불가리스|액티비아|요플레/, (u) => (u === 'ml' ? R('기타 발효유(액상)', 150, 'ml') : R('기타 발효유(호상)', 100, 'g'))],
  [/커피|아메리카노|라떼|콜드브루|헤이즐넛/, R('커피', 240, 'ml')],
  [/두유|콩국물?$/, R('두유류', 200, 'ml')],
  [/만두/, R('만두', 150, 'g')],
  [/카레|커리/, R('카레 레토르트식품', 200, 'g')],
  [/볶음밥|덮밥|비빔밥|주먹밥|밥$/, R('밥', 210, 'g')],
  [/찌개/, R('찌개', 200, 'either')],
  [/죽$/, R('죽', 250, 'either')],
  [/스프$|수프$/, R('스프', 150, 'either')],
  [/(?<!사)탕(?!수)|육개장|전골|해장국|국$|국물$/, R('국·탕', 250, 'either')],
  [/버거$|샌드위치/, R('햄버거·샌드위치류', 150, 'g')],
  // 유탕면(라면·너구리류)은 봉지·용기, 그 밖 면 요리 밀키트는 생면·숙면 200 g
  [/라면|구리$|컵면|사발면/, (_u, n) => (/컵|용기|사발|큰그릇|왕뚜껑/.test(n) ? R('유탕면(용기)', 80, 'g') : R('유탕면(봉지)', 120, 'g'))],
  [/건면|세면/, R('건면', 100, 'g')],
  [/짜장면|자장면|짬뽕|라멘(?!보)|우동|국수|칼국수|칼제비|냉면|쫄면|소바|수제비|파스타|스파게티|딸리아뗄레/, R('생면·숙면', 200, 'g')],
  [/떡볶이|라볶이|라뽁이|떡$/, R('떡류', 100, 'g')],
  [/함박|미트볼|떡갈비|동그랑땡|완자|너비아니|패티|너겟|경단|산적|육원전/, R('분쇄가공육제품', 50, 'g')],
  [/순대/, R('기타 식육함유가공품', 50, 'g')],
  [/폭립|(?<!닭)갈비(?!탕)/, R('갈비가공품', 100, 'g')],
  [/불고기|닭갈비|주물럭|찜닭|닭볶음|닭강정|닭불|닭다리|치킨|닭가슴살|윙|텐더|가라아게|돈까스|돈가스|카츠|제육|수육|보쌈|족발|삼겹살|꿔바로우|탕수육/, R('양념육', 100, 'g')],
  [/사워도우|식빵|빵$|브레드|크로와상|크루아상|베이글|바게트/, R('빵류', 70, 'g')],
  [/어묵/, R('어묵', 30, 'g')],
  [/스팸|햄$|소시지|소세지/, R('햄·소시지', 30, 'g')],
  [/김치$|깍두기$/, R('기타김치', 40, 'g')],
  [/시리얼|그래놀라/, R('시리얼류', 30, 'g')],
  [/누룽지/, R('누룽지', 60, 'g')],
];

/** 음료로 들어온 포장인데 위 규칙에 없으면 과채·혼합음료 200 ml(g) — 마시는 농도(1 kcal/ml 이하)일 때만 (청·시럽은 아님) */
const DRINK_FALLBACK = R('음료류', 200, 'either');
/**
 * "ml(g)" 로 적힌 국·탕·찌개·죽·스프·음료 참고량은 먹을 수 있게 조리된 상태 기준이다.
 * 포장의 열량 밀도가 이보다 높으면 건조·농축 제품(가루 수프·차 청)이라 참고량을 그대로 쓰지 않는다.
 */
export const LIQUID_MAX_KCAL_PER_UNIT = 1.5;
const DRINK_MAX_KCAL_PER_UNIT = 1.0;
const LIQUID_LABELS = new Set(['국·탕', '찌개', '죽', '스프']);

/** "1개 (1132 g)" · "1인분 (1800 ml)" → 포장 전체 양 */
export function packAmount(serving: string): { value: number; unit: Unit } | null {
  const m = serving.match(/^1(?:개|인분)\s*\((\d+(?:\.\d+)?)\s*(g|ml)\)$/);
  return m ? { value: Number(m[1]), unit: m[2] as Unit } : null;
}

/** 이름·포장 단위 → 1회 섭취참고량. 정할 수 없으면 null */
export function packagedRef(name: string, unit: Unit, category?: MenuItem['category']): PackRef | null {
  const n = name.normalize('NFKC').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (SKIP_RE.test(n)) return null;
  for (const [re, ref] of PACK_RULES) if (re.test(n)) return typeof ref === 'function' ? ref(unit, n) : ref;
  return category === 'drink' ? DRINK_FALLBACK : null;
}

const fmtTotal = (v: number, unit: Unit) =>
  unit === 'ml' && v >= 1000 ? `${Math.round(v / 100) / 10} L` : `${Math.round(v).toLocaleString('en-US')} ${unit}`;

/**
 * 대용량('bulk') 포장 → 1회 섭취참고량 메뉴 (새 id, estimated). 대상이 아니거나 유형을 모르면 null.
 * 참고량이 포장보다 크거나 같으면(한 번에 먹는 양) 바꾸지 않는다.
 */
export function toPackagedServing(menu: MenuItem): MenuItem | null {
  if (!menu.nutrients || menu.id.endsWith(PACK_SERVING_ID_SUFFIX)) return null;
  if (nonMealKind(menu) !== 'bulk') return null;
  const total = packAmount(menu.serving);
  if (!total) return null;
  const ref = packagedRef(menu.name, total.unit, menu.category);
  if (!ref || (ref.unit !== 'either' && ref.unit !== total.unit) || ref.amount >= total.value) return null;
  const density = menu.nutrients.kcal / total.value;
  if (ref === DRINK_FALLBACK ? density > DRINK_MAX_KCAL_PER_UNIT : LIQUID_LABELS.has(ref.label) && density > LIQUID_MAX_KCAL_PER_UNIT) return null;
  const unit = total.unit;
  return {
    ...menu,
    id: `${menu.id}${PACK_SERVING_ID_SUFFIX}`,
    serving: `1회 섭취참고량 (${ref.amount} ${unit})`,
    nutrients: scaleNutrients(menu.nutrients, ref.amount / total.value),
    trust: 'estimated',
    servingNote: `전체 ${fmtTotal(total.value, unit)} 제품 · 식약처 1회 섭취참고량(${ref.label} ${ref.amount} ${unit}) 기준 추정이에요`,
  };
}

export interface PackagedResult {
  menus: MenuItem[];
  /** 목록에서 빠진 원래 포장 메뉴 (id 조회용) */
  hidden: MenuItem[];
  converted: number;
}

/** 목록 순서를 지키며 변환 (입력은 바꾸지 않는다) */
export function applyPackagedServing(menus: MenuItem[]): PackagedResult {
  const hidden: MenuItem[] = [];
  const out: MenuItem[] = [];
  for (const m of menus) {
    const next = toPackagedServing(m);
    if (next) {
      hidden.push(m);
      out.push(next);
    } else out.push(m);
  }
  return { menus: out, hidden, converted: hidden.length };
}
