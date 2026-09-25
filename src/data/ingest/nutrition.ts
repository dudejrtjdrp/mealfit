/**
 * 식약처 전국통합식품영양성분정보(음식·가공식품) 표준데이터 → mealfit MenuItem 변환 로직.
 * 순수 함수만 둔다 (파일·네트워크 I/O 없음) — scripts/ingest-nutrition.mjs 가 호출하고 jest 로 검증한다.
 *
 * Node 의 타입 제거 실행(`node scripts/...` 에서 .ts import)과 Metro/Jest 양쪽에서 돌아야 하므로
 * 값(import) 의존은 두지 않고 타입만 가져온다. 레지스트리는 인자로 받는다.
 */
import type { Brand, Coverage, MenuCategory, MenuItem, Nutrients } from '../../domain/types';
import type { RegistryBrand } from './brandRegistry';

export type DatasetKind = 'food' | 'processed';

export const DATASETS: Record<DatasetKind, { url: string; sourceName: string }> = {
  food: {
    url: 'https://www.data.go.kr/data/15100070/standard.do',
    sourceName: '식약처·전국통합식품영양성분정보(음식)',
  },
  processed: {
    url: 'https://www.data.go.kr/data/15100066/standard.do',
    sourceName: '식약처·전국통합식품영양성분정보(가공식품)',
  },
};

// ───────────────────────── 파일 디코딩·CSV ─────────────────────────

type DecoderCtor = new (label: string, opts?: { fatal?: boolean }) => { decode(b: Uint8Array): string };

/**
 * UTF-8(BOM 포함)이 아니면 CP949(EUC-KR)로 읽는다 — 공공데이터포털 CSV 는 대부분 CP949.
 * Expo 런타임의 TextDecoder 는 UTF-8 만 알아서, Node 의 TextDecoder 를 주입받을 수 있게 둔다.
 */
export function decodeKoreanText(bytes: Uint8Array, Decoder: DecoderCtor = TextDecoder as unknown as DecoderCtor): string {
  try {
    const s = new Decoder('utf-8', { fatal: true }).decode(bytes);
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  } catch {
    return new Decoder('euc-kr').decode(bytes);
  }
}

/** RFC 4180 CSV (따옴표 안 콤마·줄바꿈·"" 이스케이프) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// ───────────────────────── 헤더 → 필드 ─────────────────────────

/** 표준데이터 필드명은 배포 시점마다 괄호·공백 표기가 조금씩 달라 정규화 후 접두어로 찾는다 */
function headerKey(h: string): string {
  return h.replace(/\s+/g, '').replace(/[()（）\[\]]/g, '').toLowerCase();
}

type Field =
  | 'code'
  | 'name'
  | 'company'
  | 'maker'
  | 'importer'
  | 'distributor'
  | 'majorCat'
  | 'midCat'
  | 'subCat'
  | 'repName'
  | 'basis'
  | 'weight'
  | 'servingRef'
  | 'kcal'
  | 'carbs'
  | 'sugar'
  | 'protein'
  | 'fat'
  | 'satFat'
  | 'sodium'
  | 'caffeine'
  | 'refDate'
  | 'origin';

/** 앞에 있는 후보가 우선. 값은 headerKey() 한 필드명의 접두어 */
const FIELD_ALIASES: Record<Field, string[]> = {
  code: ['식품코드'],
  name: ['식품명'],
  company: ['업체명', '상호명'],
  maker: ['제조사명'],
  importer: ['수입업체명'],
  distributor: ['유통업체명'],
  majorCat: ['식품대분류명', '대분류명', '식품대분류'],
  midCat: ['식품중분류명', '중분류명', '식품중분류'],
  subCat: ['식품소분류명', '소분류명'],
  repName: ['대표식품명'],
  basis: ['영양성분함량기준량', '영양성분기준량', '1회제공량기준', '기준량'],
  weight: ['식품중량', '총내용량', '내용량'],
  servingRef: ['1회섭취참고량', '1인분', '1회제공량'],
  kcal: ['에너지kcal', '에너지', '열량'],
  carbs: ['탄수화물g', '탄수화물'],
  sugar: ['당류g', '당류', '총당류'],
  protein: ['단백질g', '단백질'],
  fat: ['지방g', '지방'],
  satFat: ['포화지방산g', '포화지방산', '포화지방'],
  sodium: ['나트륨mg', '나트륨'],
  caffeine: ['카페인mg', '카페인'],
  refDate: ['데이터기준일자', '데이터생성일자'],
  origin: ['식품기원명'],
};

export type ColumnMap = Partial<Record<Field, number>>;

export function resolveColumns(header: string[]): ColumnMap {
  const keys = header.map(headerKey);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
    for (const alias of FIELD_ALIASES[field]) {
      const a = headerKey(alias);
      // 완전 일치 먼저, 없으면 접두어 (예: "지방g" 가 "지방산" 을 잡지 않도록 완전 일치 우선)
      let idx = keys.findIndex((k, i) => !used.has(i) && k === a);
      if (idx < 0) idx = keys.findIndex((k, i) => !used.has(i) && k.startsWith(a) && !(field === 'fat' && k.includes('지방산')));
      if (idx >= 0) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

/** 가공식품 표준데이터는 유통업체명·품목제조보고번호 같은 필드가 있다 */
export function detectDatasetKind(header: string[]): DatasetKind {
  const keys = header.map(headerKey);
  return keys.some((k) => k.startsWith('유통업체명') || k.startsWith('품목제조보고번호') || k.startsWith('제조사명')) ? 'processed' : 'food';
}

// ───────────────────────── 값 정규화 ─────────────────────────

/** "12.5" · "1,234" → 수치. 빈칸·"-"·"Tr"(미량)·"N/A" 는 null — 숫자를 지어내지 않는다 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface Amount {
  value: number;
  unit: 'g' | 'ml';
}

/** "100g" · "100 g" · "355mL" · "1인분(300g)" · "1.5L" → {value, unit}. 단위가 g/ml 계열이 아니면 null */
export function parseAmount(raw: string | undefined): Amount | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|ML|l|L)(?![a-z])/i);
  if (!m) {
    // 숫자만 있으면 g 로 본다 (표준데이터 식품중량 필드는 단위 없이 숫자만 오는 경우가 있다)
    const n = parseNumber(s);
    return n && n > 0 ? { value: n, unit: 'g' } : null;
  }
  let value = Number(m[1]);
  const u = m[2].toLowerCase();
  if (!(value > 0)) return null;
  if (u === 'kg') value *= 1000;
  if (u === 'l') value *= 1000;
  return { value, unit: u === 'g' || u === 'kg' ? 'g' : 'ml' };
}

/** 법인 표기·공백·기호를 지운 업체명 비교 키. "(주)비케이알" · "주식회사 비케이알" · "㈜ 비케이알" → "비케이알" */
export function normalizeCompany(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .replace(/\(\s*(주|유|사|재|합)\s*\)|㈜|㈔/g, '')
    .replace(/주식회사|유한회사|유한책임회사|농업회사법인|영농조합법인/g, '')
    .replace(/\b(co\.?\s*,?\s*ltd\.?|inc\.?|corp\.?|corporation|company|korea\s+limited|ltd\.?)\b/gi, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toUpperCase();
}

/** 메뉴명 비교 키 — 공백·기호·괄호 속 규격 무시, "ICE/아이스" 같은 표기 흔들림은 건드리지 않는다(오매칭 방지) */
export function normalizeMenuName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\((?:[^)]*?(?:\d+\s*(?:g|ml|l|kcal)|tall|grande|venti|regular|large|small)[^)]*)\)/gi, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 화면용 텍스트 정규화: NFKC + 아래아 가운뎃점(ㆍ U+318D · ᆞ U+119E, NFKC 가 앞을 뒤로 바꾼다)을 '·' 로.
 * 원본은 "과ㆍ채주스" 처럼 한글 자모 아래아를 가운뎃점 대신 쓴다.
 */
export function normalizeDisplayText(raw: string): string {
  return raw.normalize('NFKC').replace(/[ㆍᆞ]/g, '·');
}

/** 분류명이 "없음"을 뜻하는 표준데이터 자리표시 값 */
const NO_CATEGORY = new Set(['', '-', '해당없음', '해당 없음', '없음']);

/**
 * 원본 식품명 앞에 붙은 분류 접두어 후보 — 그 행의 식품중분류명·식품소분류명·대표식품명(과 그 첫 토큰).
 * 음식 DB 식품명은 "대표식품명_메뉴명" 꼴이다 ("기타차_제주 그린티 브리즈 (Grande)").
 */
export function categoryPrefixes(...names: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = normalizeDisplayText(raw ?? '').trim();
    if (NO_CATEGORY.has(n)) continue;
    out.add(n);
    const first = n.split(/\s+/)[0];
    if (first && !NO_CATEGORY.has(first)) out.add(first);
  }
  // 긴 것부터 — "기타 커피" 가 "기타" 보다 먼저 잡히게
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * 원본 식품명의 접두어를 떼어 화면용 이름으로.
 * 1) "브랜드_메뉴" · "[브랜드] 메뉴" 의 브랜드 접두어
 * 2) "기타차_메뉴" · "과·채주스 메뉴" 의 분류 접두어 (categoryPrefixes) — 뒤에 '_' 나 공백이 있어야 뗀다("녹차라떼" 의 "녹차" 는 두고)
 * 떼고 나서 빈 문자열이 되면 떼지 않는다. 사이즈 같은 뒤쪽 괄호 "(Grande)" 는 유용한 정보라 남긴다.
 */
export function cleanMenuName(raw: string, brandNames: string[], categoryNames: string[] = []): string {
  let s = normalizeDisplayText(raw).trim();
  for (const b of brandNames) {
    // 브랜드명 뒤에 닫는 괄호·_·:·- 또는 공백이 있어야 뗀다 ("CU" 가 "cucumber" 앞을 먹지 않게)
    const re = new RegExp(`^\\s*[\\[(]?\\s*${escapeRe(b)}(?:\\s*[\\])]\\s*[_:\\-]?|\\s*[_:\\-]|\\s+)\\s*`, 'i');
    if (re.test(s) && s.replace(re, '').length > 0) {
      s = s.replace(re, '');
      break;
    }
  }
  s = s.replace(/\s+/g, ' ');
  for (const c of categoryNames) {
    const re = new RegExp(`^${escapeRe(normalizeDisplayText(c).replace(/\s+/g, ' '))}(?:\\s*_|\\s+)`, 'i');
    if (!re.test(s)) continue;
    const rest = s.replace(re, '').replace(/^[\s_]+/, '');
    if (rest.length > 0) s = rest;
    break;
  }
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// ───────────────────────── 브랜드 매칭 ─────────────────────────

export interface BrandMatcher {
  /** 정규화 업체명 → brandId. 한 업체명이 여러 브랜드에 걸리면 등록하지 않는다(애매하면 버림) */
  byCompany: Map<string, string>;
  registry: Map<string, RegistryBrand>;
}

export function buildBrandMatcher(registry: RegistryBrand[]): BrandMatcher {
  const seen = new Map<string, Set<string>>();
  for (const b of registry) {
    for (const alias of [b.name, ...b.companyAliases]) {
      const k = normalizeCompany(alias);
      if (!k) continue;
      const set = seen.get(k) ?? new Set<string>();
      set.add(b.id);
      seen.set(k, set);
    }
  }
  const byCompany = new Map<string, string>();
  for (const [k, ids] of seen) if (ids.size === 1) byCompany.set(k, [...ids][0]);
  return { byCompany, registry: new Map(registry.map((b) => [b.id, b])) };
}

/** 업체명(음식) 또는 유통업체명(가공식품) 완전 일치로만 브랜드를 정한다 */
export function matchRowBrand(
  matcher: BrandMatcher,
  kind: DatasetKind,
  company: string | undefined,
  distributor: string | undefined,
): string | undefined {
  const candidates = kind === 'processed' ? [distributor, company] : [company, distributor];
  for (const c of candidates) {
    const id = matcher.byCompany.get(normalizeCompany(c));
    if (!id) continue;
    // 가공식품 DB 는 편의점 PB 만 받는다 (카페 브랜드 스틱커피 등 매장 메뉴가 아닌 제품 배제)
    if (kind === 'processed' && !matcher.registry.get(id)?.processedOk) return undefined;
    return id;
  }
  return undefined;
}

// ───────────────────────── 영양·제공량 ─────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;
const round0 = (n: number) => Math.round(n);

export interface ServingResult {
  nutrients: Nutrients;
  serving: string;
  servingNote?: string;
}

/**
 * 기준량(보통 100 g) 당 수치를 1인분(식품중량 → 1회섭취참고량) 으로 환산한다.
 * 1인분량을 모르면 기준량 그대로 두고 servingNote 로 "100 g 기준" 임을 밝힌다.
 * kcal 이 없으면 null (판정 불가 — 새 메뉴로 넣지 않는다).
 */
export function toServing(
  per: Partial<Record<'kcal' | 'carbs' | 'sugar' | 'protein' | 'fat' | 'satFat' | 'sodium' | 'caffeine', number | null>>,
  basisRaw: string | undefined,
  weightRaw: string | undefined,
  servingRefRaw: string | undefined,
): ServingResult | null {
  if (per.kcal == null) return null;
  const basis = parseAmount(basisRaw) ?? { value: 100, unit: 'g' as const };
  const weight = parseAmount(weightRaw);
  const ref = parseAmount(servingRefRaw);
  const portion = [weight, ref].find((a) => a && a.unit === basis.unit) ?? null;
  const factor = portion ? portion.value / basis.value : 1;

  const g = (v: number | null | undefined) => (v == null ? undefined : round1(v * factor));
  const mg = (v: number | null | undefined) => (v == null ? undefined : round0(v * factor));
  const nutrients: Nutrients = { kcal: round0(per.kcal * factor) };
  const fields: [keyof Nutrients, number | undefined][] = [
    ['carbs', g(per.carbs)],
    ['protein', g(per.protein)],
    ['fat', g(per.fat)],
    ['satFat', g(per.satFat)],
    ['sugar', g(per.sugar)],
    ['sodium', mg(per.sodium)],
    ['caffeine', mg(per.caffeine)],
  ];
  for (const [k, v] of fields) if (v !== undefined) nutrients[k] = v;

  const fmt = (a: Amount) => `${Number.isInteger(a.value) ? a.value : round1(a.value)} ${a.unit}`;
  if (portion) return { nutrients, serving: `1인분 (${fmt(portion)})` };
  return {
    nutrients,
    serving: `${fmt(basis)} 기준`,
    servingNote: `1인분 제공량 정보가 없어 ${fmt(basis)} 기준으로 표시해요.`,
  };
}

// ───────────────────────── 카테고리 ─────────────────────────

const DRINK_RE = /(음료|커피|차류|다류|주스|쥬스|라떼|아메리카노|에스프레소|카푸치노|프라푸치노|티$|에이드|스무디|셰이크|쉐이크|밀크티|우유|두유|콜라|사이다|탄산)/;
const SNACK_RE = /(빵|과자|케이크|케익|쿠키|도넛|도너츠|머핀|와플|아이스크림|빙수|디저트|초콜릿|초콜렛|젤리|사탕|떡류|파이|타르트|마카롱|스콘|베이글|크로와상|크루아상|푸딩|요거트|요구르트|과일|견과|선데이|츄러스|플러리|소프트콘|아이스콘)/;
const SALAD_RE = /(샐러드|포케)/;
const MEAL_RE = /(버거|샌드위치|피자|토스트|핫도그|파니니|부리또|부리토|타코|랩$|도시락|김밥|삼각김밥|주먹밥|덮밥|비빔밥|볶음밥|국밥|죽$|면$|파스타|치킨$|떡볶이)/;
const SIDE_RE = /(감자튀김|프렌치프라이|후렌치|너겟|치즈스틱|어니언링|콘샐러드|코울슬로|사이드|소스|디핑|해시브라운|웨지감자)/;

export function inferCategory(name: string, majorCat?: string, midCat?: string, brandCategory?: string): MenuCategory {
  const cat = `${majorCat ?? ''} ${midCat ?? ''}`;
  if (SALAD_RE.test(name)) return 'salad';
  if (SIDE_RE.test(name)) return 'side';
  // 음식 DB 는 버거·샌드위치·피자를 "빵 및 과자류" 로 분류하므로 이름으로 먼저 식사를 가른다
  if (MEAL_RE.test(name)) return 'meal';
  if (/(음료|다류|커피|차류|주류|유제품)/.test(cat) || DRINK_RE.test(name)) return 'drink';
  // 버거·치킨·분식 브랜드는 식품분류("빵 및 과자류")보다 브랜드 성격을 믿는다 — 와퍼는 간식이 아니다
  if (brandCategory === 'fastfood' || brandCategory === 'korean') return SNACK_RE.test(name) ? 'snack' : 'meal';
  if (/(빵|과자|떡|빙과|아이스크림|당류|초콜릿|과일|견과)/.test(cat) || SNACK_RE.test(name)) return 'snack';
  if (brandCategory === 'cafe') return 'drink';
  return 'meal';
}

// ───────────────────────── 행 → 메뉴 ─────────────────────────

export interface IngestRow {
  kind: DatasetKind;
  cells: string[];
  cols: ColumnMap;
}

export interface IngestedMenu extends MenuItem {
  /** 같은 브랜드+이름 중복 시 최신 기준일자를 고르기 위한 내부 값 (파일엔 남기지 않음) */
  _refDate?: string;
}

export type SkipReason = 'no-brand' | 'no-name' | 'no-kcal';

export function slugifyCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function rowToMenu(row: IngestRow, matcher: BrandMatcher): { menu: IngestedMenu } | { skip: SkipReason } {
  const cell = (f: Field) => (row.cols[f] == null ? undefined : row.cells[row.cols[f]!]?.trim());
  const brandId = matchRowBrand(matcher, row.kind, cell('company'), cell('distributor'));
  if (!brandId) return { skip: 'no-brand' };
  const brand = matcher.registry.get(brandId)!;
  const rawName = cell('name');
  if (!rawName) return { skip: 'no-name' };
  const name = cleanMenuName(rawName, [brand.name, ...brand.companyAliases], categoryPrefixes(cell('midCat'), cell('subCat'), cell('repName')));
  if (!name) return { skip: 'no-name' };

  const num = (f: Field) => parseNumber(cell(f));
  const serving = toServing(
    {
      kcal: num('kcal'),
      carbs: num('carbs'),
      sugar: num('sugar'),
      protein: num('protein'),
      fat: num('fat'),
      satFat: num('satFat'),
      sodium: num('sodium'),
      caffeine: num('caffeine'),
    },
    cell('basis'),
    cell('weight'),
    cell('servingRef'),
  );
  if (!serving) return { skip: 'no-kcal' };

  // 분류 접두어를 뗀 이름엔 "커피"·"피자" 같은 단서가 빠질 수 있어 대표식품명을 붙여 추정한다
  const repName = cell('repName');
  const hint = repName && !NO_CATEGORY.has(repName) ? `${normalizeDisplayText(repName)} ${name}` : name;
  const category = inferCategory(hint, cell('majorCat'), cell('midCat'), brand.category);
  const code = cell('code');
  const ds = DATASETS[row.kind];
  const menu: IngestedMenu = {
    id: `${brandId}-mfds-${code ? slugifyCode(code) : slugifyCode(normalizeMenuName(name)) || 'item'}`,
    brandId,
    name,
    category,
    serving: serving.serving,
    nutrients: serving.nutrients,
    trust: 'official',
    sourceUrl: ds.url,
    sourceName: ds.sourceName,
    imageKey: category,
  };
  if (serving.servingNote) menu.servingNote = serving.servingNote;
  if (serving.nutrients.caffeine && serving.nutrients.caffeine > 0) menu.tags = ['카페인 있음'];
  const ref = cell('refDate');
  if (ref) menu._refDate = ref;
  return { menu };
}

// ───────────────────────── 시판 가공식품(제품) ─────────────────────────

/**
 * 검색 카탈로그에 싣는 소비자 제품 대분류 → 우선순위 (작을수록 먼저 싣고, 용량 초과 시 뒤부터 뺀다).
 * "그대로 사 먹는 것"은 다 싣고, 재료·양념성 분류(식용유지류·조미식품·장류·특수의료용도식품)만 뺀다 — 2026-09-24 효님 "다양한 제품" 요청.
 */
export const PRODUCT_MAJOR_CATEGORIES: Record<string, number> = {
  면류: 0, // 라면·국수
  즉석식품류: 1, // 도시락·김밥·즉석밥
  '과자류·빵류 또는 떡류': 2,
  빙과류: 3,
  '코코아가공품류 또는 초콜릿류': 4,
  음료류: 5,
  유가공품류: 6,
  '식육가공품 및 포장육': 7, // 소시지·햄
  수산가공식품류: 8, // 어묵·맛살·참치캔
  '두부류 또는 묵류': 9,
  농산가공식품류: 10, // 견과·과일가공·시리얼
  '절임류 또는 조림류': 11,
  당류: 12,
  잼류: 13,
  알가공품류: 14,
  특수영양식품: 15, // 단백질 보충·이유식
  기타식품류: 16,
  동물성가공식품류: 17,
  '벌꿀 및 화분가공 식품류': 18,
  주류: 19,
};

/** 모든 시판 제품이 공유하는 가상 브랜드 id — 매장 매칭 키워드는 비워 둔다(장소 이름과 매칭되면 안 됨) */
export const PACKAGED_BRAND_ID = 'packaged';

/**
 * 법인 표기를 뗀 화면용 업체명. "오뚜기라면(주)" → "오뚜기라면", "오리온 제4청주공장" → "오리온".
 * 같은 회사가 공장별로 갈라져 있으면(빈도 희석·중복 항목) 하나로 합쳐지도록 공장 접미사도 뗀다.
 */
export function displayCompany(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = normalizeDisplayText(raw)
    .replace(/\(\s*(주|유|사|재|합)\s*\)|㈜|㈔/g, '')
    .replace(/주식회사|유한회사|유한책임회사|농업회사법인|영농조합법인/g, '')
    .replace(/\s*(제?\s*\d+)?\s*[가-힣A-Za-z]{0,2}\s*공장$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || NO_CATEGORY.has(s)) return undefined;
  return s.length > 20 ? `${s.slice(0, 19)}…` : s;
}

export interface IngestedProduct extends MenuItem {
  _refDate?: string;
  /** 포장 중량 (같은 이름 묶음·단품 중 단품을 고르기 위한 내부 값) */
  _weight?: number;
  /** 용량 초과 시 뒤 카테고리부터 빼기 위한 우선순위 */
  _priority?: number;
}

/**
 * 업소용·식자재 제품 — 개인이 한 번에 먹는 단위가 아니라 시판 제품 카탈로그에서 뺀다.
 * "원료"는 "무농약원료 표고버섯 45g" 같은 소비자 제품에도 붙어 이름 키워드로는 쓰지 않는다(중량 상한이 거른다).
 */
const BULK_NAME_RE = /(업소용|업무용|업체용|대용량|식자재|급식용?|벌크|\(업\))/;
/** 이 중량(g·ml) 이상이면 업소용으로 본다 — 소비자 최대 포장(2 L 음료·2.3 L 아이스크림)보다 크다 */
export const BULK_WEIGHT_MIN = 3000;
/** 포장 중량이 1회 섭취참고량의 이 배수를 넘으면 "1개 = 한 번 먹는 양"으로 보지 않는다 (묶음·가족용) */
export const MULTI_SERVING_RATIO = 3;
/** 이 중량(g·ml) 이하 포장은 참고량과 상관없이 1개로 본다 — 닭가슴살 120 g·초콜릿 72 g 처럼 참고량이 작아도 한 번에 먹는 단위 */
export const SINGLE_PACK_MAX = 150;

const CUP_RE = /(컵|사발|용기|왕뚜껑|도시락|큰그릇|볼$)/;

/**
 * 식약처 "1회 섭취참고량" → 이 제품에 해당하는 양.
 * 한 칸에 여러 기준이 섞여 오기도 한다: "생·숙면 200g, 건면 100g, 당면 30g, 유탕면(봉지)120g, 유탕면(용기)80"
 * → 소분류(건면·유탕면…)와 이름(컵·사발 → 용기)으로 하나를 고르고, 못 고르면 null (추측하지 않는다).
 */
export function resolveServingRef(
  raw: string | undefined,
  ctx: { name: string; subCat?: string; midCat?: string },
): Amount | null {
  if (!raw || !raw.trim()) return null;
  const pieces = raw.split(',').map((t) => t.trim()).filter(Boolean);
  const parsed = pieces.map((t) => {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)?(?:\([^)]*\))?\s*$/i);
    const label = m ? t.slice(0, m.index).trim() : t;
    const lp = label.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    return {
      base: (lp ? lp[1] : label).trim(),
      qual: lp ? lp[2].trim() : '',
      value: m ? Number(m[1]) : NaN,
      unit: m?.[2]?.toLowerCase(),
    };
  });
  // 단위가 잘린 항목("…(용기)80")은 같은 칸의 다른 항목 단위를 따른다
  const knownUnit = parsed.find((p) => p.unit)?.unit ?? 'g';
  const toAmount = (p: (typeof parsed)[number]): Amount | null => {
    if (!(p.value > 0)) return null;
    const u = p.unit ?? knownUnit;
    return { value: u === 'kg' || u === 'l' ? p.value * 1000 : p.value, unit: u === 'g' || u === 'kg' ? 'g' : 'ml' };
  };
  if (parsed.length === 1) return parsed[0].base === '' || pieces.length === 1 ? toAmount(parsed[0]) : null;

  const sub = [ctx.subCat, ctx.midCat].filter((v) => v && v !== '해당없음') as string[];
  const tokens = (base: string) => base.split(/[·・/]/).map((t) => t.trim()).filter(Boolean);
  let cands = parsed.filter((p) => p.base && tokens(p.base).some((t) => sub.some((c) => c.startsWith(t)) || (t.length >= 2 && ctx.name.includes(t))));
  if (cands.length > 1 && cands.every((p) => p.qual)) {
    const wantCup = CUP_RE.test(ctx.name);
    cands = cands.filter((p) => (wantCup ? /용기|컵/.test(p.qual) : /봉지/.test(p.qual)));
  }
  return cands.length === 1 ? toAmount(cands[0]) : null;
}

/**
 * 가공식품 표준데이터 행 → 시판 제품 MenuItem (매장 브랜드에 매칭되지 않은 행용).
 * 소비자 제품 대분류만 받는다 — 식용유·장류·조미식품 같은 재료성 분류는 "지금 사 먹을 것"이 아니라 뺀다.
 */
export function rowToProduct(row: IngestRow): { menu: IngestedProduct } | { skip: SkipReason | 'not-consumer' | 'bulk' } {
  const cell = (f: Field) => (row.cols[f] == null ? undefined : row.cells[row.cols[f]!]?.trim());
  const majorCat = cell('majorCat') ?? '';
  const priority = PRODUCT_MAJOR_CATEGORIES[majorCat];
  if (priority === undefined) return { skip: 'not-consumer' };
  const rawName = cell('name');
  if (!rawName) return { skip: 'no-name' };
  const name = normalizeDisplayText(rawName).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return { skip: 'no-name' };
  if (BULK_NAME_RE.test(name)) return { skip: 'bulk' };
  const weight = parseAmount(cell('weight'));
  if (weight && weight.value >= BULK_WEIGHT_MIN) return { skip: 'bulk' };

  // 1개 = 포장 중량. 단, 포장이 1회 섭취참고량의 여러 배(묶음·가족용)이거나 중량이 없으면
  // 개수를 지어내 나누지 않고 식약처 1회 섭취참고량 기준으로 보여주고 "추정"으로 표시한다.
  // (같은 이름의 단품 행이 있으면 dedupeProducts 가 그 단품을 고른다 — 그쪽은 정확한 공식값)
  const basisUnit = (parseAmount(cell('basis')) ?? { unit: 'g' }).unit;
  const refRaw = resolveServingRef(cell('servingRef'), { name, subCat: cell('subCat'), midCat: cell('midCat') });
  const ref = refRaw && refRaw.unit === basisUnit ? refRaw : null;
  const multi = !!(weight && ref && weight.unit === ref.unit && weight.value > SINGLE_PACK_MAX && weight.value > ref.value * MULTI_SERVING_RATIO);
  const useRef = !!ref && (multi || !weight || weight.unit !== basisUnit);
  const fmtAmt = (a: Amount) => `${Number.isInteger(a.value) ? a.value : Math.round(a.value * 10) / 10}${a.unit === 'g' ? 'g' : 'ml'}`;

  const num = (f: Field) => parseNumber(cell(f));
  const serving = toServing(
    {
      kcal: num('kcal'),
      carbs: num('carbs'),
      sugar: num('sugar'),
      protein: num('protein'),
      fat: num('fat'),
      satFat: num('satFat'),
      sodium: num('sodium'),
      caffeine: num('caffeine'),
    },
    cell('basis'),
    useRef ? fmtAmt(ref!) : cell('weight'),
    undefined, // 1회 섭취참고량은 위 resolveServingRef 로 골라 쓴다 (원문은 여러 기준이 섞인 텍스트)
  );
  if (!serving) return { skip: 'no-kcal' };

  // 국산은 제조사, 수입품은 수입업체가 소비자에게 익숙한 이름이다
  const maker = displayCompany(cell('maker')) ?? displayCompany(cell('importer')) ?? displayCompany(cell('distributor'));
  const category = inferCategory(name, majorCat, cell('midCat'));
  const code = cell('code');
  const ds = DATASETS.processed;
  const menu: IngestedProduct = {
    id: `pkg-${code ? slugifyCode(code) : slugifyCode(normalizeMenuName(name)) || 'item'}`,
    brandId: PACKAGED_BRAND_ID,
    name,
    category,
    // 시판 제품의 식품중량은 포장 단위라 "1인분" 대신 "1개"로 부른다
    serving: useRef ? `1회 섭취참고량 (${fmtAmt(ref!).replace(/(g|ml)$/, ' $1')})` : serving.serving.replace(/^1인분/, '1개'),
    nutrients: serving.nutrients,
    // 100 g 당 수치는 공식값이지만 "한 번 먹는 양"이 추정이라 estimated
    trust: useRef ? 'estimated' : 'official',
    sourceUrl: ds.url,
    sourceName: ds.sourceName,
    imageKey: category,
  };
  if (useRef) {
    // 번들 용량을 아끼려고 짧게 — 상세 화면(D4) 영양 카드 아래에 그대로 보인다
    menu.servingNote = multi ? `전체 ${fmtAmt(weight!)} 제품 · 식약처 1회 섭취참고량 기준 추정` : '포장 중량 정보 없음 · 식약처 1회 섭취참고량 기준 추정';
  } else if (serving.servingNote) menu.servingNote = serving.servingNote;
  if (weight) menu._weight = weight.value;
  if (maker) menu.maker = maker;
  if (serving.nutrients.caffeine && serving.nutrients.caffeine > 0) menu.tags = ['카페인 있음'];
  const refDate = cell('refDate');
  if (refDate) menu._refDate = refDate;
  menu._priority = priority;
  return { menu };
}

/**
 * 같은 이름+제조사는 하나만 남긴다 (수입/재보고·묶음 중복 정리). 고르는 순서:
 * 1) 1개 무게가 확실한 공식 행(단품) — "안성탕면 125g"과 "안성탕면 625g(5개입)"이면 125g
 * 2) 기준일자 최신  3) 중량이 작은 쪽(단품일 확률)
 * id 충돌은 접미사로 피한다
 */
export function dedupeProducts(products: IngestedProduct[]): (MenuItem & { _priority?: number })[] {
  const rank = (p: IngestedProduct) => (p.trust === 'official' ? 1 : 0);
  const better = (a: IngestedProduct, b: IngestedProduct) => {
    if (rank(a) !== rank(b)) return rank(a) > rank(b);
    const da = a._refDate ?? '';
    const db = b._refDate ?? '';
    if (da !== db) return da > db;
    return (a._weight ?? Infinity) < (b._weight ?? Infinity);
  };
  const best = new Map<string, IngestedProduct>();
  for (const p of products) {
    const key = `${normalizeMenuName(p.name)}|${normalizeCompany(p.maker)}`;
    const prev = best.get(key);
    if (!prev || better(p, prev)) best.set(key, p);
  }
  const ids = new Set<string>();
  const out: (MenuItem & { _priority?: number })[] = [];
  for (const p of best.values()) {
    const { _refDate, _weight, ...rest } = p;
    void _refDate;
    void _weight;
    let id = rest.id;
    for (let n = 2; ids.has(id); n++) id = `${rest.id}-${n}`;
    ids.add(id);
    out.push({ ...rest, id });
  }
  return out;
}

/** 같은 브랜드 + 정규화 이름이면 기준일자가 최신인 것 하나만. id 충돌은 접미사로 피한다 */
export function dedupeMenus(menus: IngestedMenu[]): MenuItem[] {
  const best = new Map<string, IngestedMenu>();
  for (const m of menus) {
    const key = `${m.brandId}|${normalizeMenuName(m.name)}`;
    const prev = best.get(key);
    if (!prev || (m._refDate ?? '') > (prev._refDate ?? '')) best.set(key, m);
  }
  const ids = new Set<string>();
  const out: MenuItem[] = [];
  for (const m of best.values()) {
    const { _refDate, ...rest } = m;
    void _refDate;
    let id = rest.id;
    for (let n = 2; ids.has(id); n++) id = `${rest.id}-${n}`;
    ids.add(id);
    out.push({ ...rest, id });
  }
  return out;
}

// ───────────────────────── 시드와 합치기 ─────────────────────────

/** 공공데이터 official 메뉴가 이만큼 이상인 브랜드는 옵션 없는 시드 estimated 메뉴를 목록에서 뺀다 */
export const SEED_ESTIMATED_CUTOFF = 20;

export interface SeedPolicyStats {
  /** 적용 기준 (공공데이터 official 메뉴 수) */
  cutoff: number;
  /** 옵션 없는 시드 estimated 를 뺀 브랜드 → 뺀 개수 */
  excludedByBrand: Record<string, number>;
  /** 목록에서 뺀 시드 메뉴 수 */
  excluded: number;
  /** 목록에 남은 시드 메뉴 수 (교체된 것 포함) */
  kept: number;
  /** 커버 브랜드인데 옵션이 있어 남긴 시드 estimated → 브랜드별 개수 */
  keptWithOptionsByBrand: Record<string, number>;
  /** 커버 브랜드인데 옵션이 있어 남긴 시드 estimated 수 (kept 에 포함) */
  keptWithOptions: number;
}

export interface MergeResult {
  menus: MenuItem[];
  replaced: number;
  /**
   * 정책으로 목록에서 뺀 시드 메뉴. 예전 기록(menuId)·딥링크가 깨지지 않게 로더는 id 조회에만 남긴다.
   */
  hidden: MenuItem[];
  seedPolicy: SeedPolicyStats;
}

/**
 * 시드(menus.json) + 공공데이터 메뉴를 합친다.
 * - (우선) 공공데이터 official 메뉴가 cutoff(기본 20)개 이상인 브랜드("커버 브랜드")는 옵션 없는 시드 estimated
 *   메뉴를 목록에서 뺀다. 시드 추정 메뉴와 공공데이터 메뉴는 이름 표기가 달라("카페 아메리카노" vs "아메리카노 (Tall)")
 *   교체 매칭이 거의 안 되고, 두면 같은 메뉴가 추정·공식으로 두 번 보인다. 시드 none·user·official 은 그대로 둔다.
 * - 단 옵션(사이즈·시럽 등)이 정의된 시드 estimated 는 커버 브랜드에서도 남기고 교체하지도 않는다 — 옵션 칩 즉시 갱신(D4)과
 *   구매 가이드("시럽 빼면…")가 이 옵션에서 나오고, 공공데이터 메뉴엔 옵션이 없다. 같은 음료가 추정(옵션)·공식(사이즈별)으로
 *   함께 보이는 중복은 감수한다.
 * - 같은 브랜드 + 정규화 이름의 시드 메뉴가 estimated/none 이면 공공데이터 값으로 교체한다.
 *   기존 기록(menuId)이 깨지지 않게 시드 id·가격·소개·태그는 유지하고, 추정치로 만든 옵션 차이(delta)는
 *   공식 기준값과 섞이면 신뢰등급이 흐려지므로 버린다.
 * - 시드가 official/user 면 시드를 그대로 두고 공공데이터 항목은 넣지 않는다.
 */
export function mergeMenus(seed: MenuItem[], official: MenuItem[], opts: { cutoff?: number } = {}): MergeResult {
  const cutoff = opts.cutoff ?? SEED_ESTIMATED_CUTOFF;
  const officialCount = new Map<string, number>();
  for (const o of official) if (o.trust === 'official') officialCount.set(o.brandId, (officialCount.get(o.brandId) ?? 0) + 1);
  const covered = (brandId: string) => (officialCount.get(brandId) ?? 0) >= cutoff;
  const hasOptions = (m: MenuItem) => (m.options?.length ?? 0) > 0;
  const hidden: MenuItem[] = [];
  const excludedByBrand: Record<string, number> = {};
  const keptWithOptionsByBrand: Record<string, number> = {};
  const listed = seed.filter((s) => {
    if (s.trust !== 'estimated' || !covered(s.brandId)) return true;
    if (hasOptions(s)) {
      keptWithOptionsByBrand[s.brandId] = (keptWithOptionsByBrand[s.brandId] ?? 0) + 1;
      return true;
    }
    hidden.push(s);
    excludedByBrand[s.brandId] = (excludedByBrand[s.brandId] ?? 0) + 1;
    return false;
  });

  const officialByKey = new Map(official.map((m) => [`${m.brandId}|${normalizeMenuName(m.name)}`, m]));
  const consumed = new Set<string>();
  let replaced = 0;
  const menus = listed.map((s) => {
    const key = `${s.brandId}|${normalizeMenuName(s.name)}`;
    const o = officialByKey.get(key);
    if (!o) return s;
    // 커버 브랜드의 옵션 시드는 교체하지 않는다(옵션 보존) — 공공데이터 항목도 따로 넣는다
    if (s.trust === 'estimated' && hasOptions(s) && covered(s.brandId)) return s;
    consumed.add(key);
    if (s.trust === 'official' || s.trust === 'user') return s;
    replaced++;
    const merged: MenuItem = {
      ...s,
      serving: o.serving,
      nutrients: o.nutrients,
      trust: 'official',
      sourceUrl: o.sourceUrl,
      sourceName: o.sourceName,
    };
    delete merged.options;
    if (o.servingNote) merged.servingNote = o.servingNote;
    return merged;
  });
  for (const o of official) if (!consumed.has(`${o.brandId}|${normalizeMenuName(o.name)}`)) menus.push(o);
  return {
    menus,
    replaced,
    hidden,
    seedPolicy: {
      cutoff,
      excludedByBrand,
      excluded: hidden.length,
      kept: listed.length,
      keptWithOptionsByBrand,
      keptWithOptions: Object.values(keptWithOptionsByBrand).reduce((a, b) => a + b, 0),
    },
  };
}

/** 메뉴 신뢰등급 분포로 브랜드 커버리지를 다시 매긴다 */
export function coverageOf(menus: MenuItem[]): Coverage {
  if (menus.length === 0) return 'none';
  const known = menus.filter((m) => m.trust !== 'none').length;
  if (known === 0) return 'none';
  return known === menus.length ? 'full' : 'partial';
}

/** 시드 브랜드 + 공공데이터로 새로 생긴 브랜드를 합치고, 메뉴에 맞게 커버리지를 갱신한다 */
export function mergeBrands(seed: Brand[], extra: Brand[], menus: MenuItem[]): Brand[] {
  const byBrand = new Map<string, MenuItem[]>();
  for (const m of menus) {
    const list = byBrand.get(m.brandId);
    if (list) list.push(m);
    else byBrand.set(m.brandId, [m]);
  }
  const seedIds = new Set(seed.map((b) => b.id));
  const all = [...seed, ...extra.filter((b) => !seedIds.has(b.id))];
  return all.map((b) => {
    const ms = byBrand.get(b.id) ?? [];
    // 시드 브랜드는 공공데이터 메뉴가 들어왔을 때만 커버리지를 다시 계산 (수작업 판단 보존)
    const touched = ms.some((m) => m.id.includes('-mfds-') || m.sourceName?.startsWith('식약처'));
    return touched || !seedIds.has(b.id) ? { ...b, coverage: coverageOf(ms) } : b;
  });
}

export function registryToBrand(r: RegistryBrand): Brand {
  const b: Brand = {
    id: r.id,
    name: r.name,
    category: r.category,
    matchKeywords: r.matchKeywords.length ? r.matchKeywords : [r.name],
    coverage: 'full',
  };
  if (r.blurb) b.blurb = r.blurb;
  return b;
}

// ───────────────────────── 일반 음식 (대표 음식 — 업체명 '해당없음') ─────────────────────────

/**
 * 브랜드가 아닌 "그냥 식당·집밥 음식"(돼지국밥·김치찌개·짜장면…)이 모두 속하는 가상 브랜드.
 * 매장 매칭 키워드는 비워 둔다 — 장소 이름과 매칭되어 "일반 식당"이라는 매장처럼 보이면 안 된다.
 */
export const GENERIC_BRAND_ID = 'generic';
/** 일반 음식 id 접두어 (getMenu 가 지연 번들에서 찾는 키) */
export const GENERIC_ID_PREFIX = 'gen-';

export interface GenericOrigin {
  key: 'dine-analyzed' | 'dine-recipe' | 'home' | 'cafeteria' | 'school';
  /** 작을수록 먼저 고른다 (같은 음식이 여러 출처로 있을 때) */
  rank: number;
  /** servingNote 앞머리 — 어떤 값인지 */
  label: string;
  /** 어느 1인분인지 */
  portion: string;
  /** 급식 1인분은 식당보다 적다 */
  small: boolean;
}

/**
 * 식품기원명 → 출처. 순서가 곧 우선순위: 외식(분석) > 외식(재료량) > 가정식 > 산업체급식 > 중고등학교급식.
 * 초등학교급식은 어린이 1인분이라 싣지 않는다 (어른 기록의 "1인분"으로 쓰면 양이 크게 모자란다 — 그 음식만 있는 행 50개 정도).
 */
const GENERIC_ORIGINS: (GenericOrigin & { re: RegExp })[] = [
  { key: 'dine-analyzed', rank: 0, re: /^외식\(분석/, label: '식약처 외식 분석값', portion: '식당 1인분 기준이에요', small: false },
  { key: 'dine-recipe', rank: 1, re: /^외식\(재료량/, label: '식약처 외식 재료량 산출값', portion: '식당 1인분 기준이에요', small: false },
  { key: 'home', rank: 2, re: /^가정식/, label: '식약처 가정식 분석값', portion: '집밥 1인분 기준이에요', small: false },
  { key: 'cafeteria', rank: 3, re: /^산업체급식/, label: '식약처 단체급식 산출값', portion: '급식 1인분이라 식당보다 적을 수 있어요', small: true },
  { key: 'school', rank: 4, re: /^중고등학교급식/, label: '식약처 중고등학교 급식 산출값', portion: '급식 1인분이라 식당보다 적을 수 있어요', small: true },
];

/** 식품기원명 → 출처 (싣지 않는 출처·프랜차이즈 행은 null) */
export function genericOrigin(raw: string | undefined): GenericOrigin | null {
  const s = (raw ?? '').replace(/\s+/g, '');
  const o = GENERIC_ORIGINS.find((x) => x.re.test(s));
  if (!o) return null;
  const { re, ...rest } = o;
  void re;
  return rest;
}

const compactName = (s: string) => normalizeMenuName(s);

/** 같은 음식의 다른 표기 — 검색어·AI 가 쓰는 말과 데이터셋 표기를 잇는다 */
const SPELLING_SWAPS: [string, string][] = [
  ['돼지고기', '돼지'],
  ['닭고기', '닭'],
  ['쇠고기', '소고기'],
  ['소고기', '쇠고기'],
  ['자장', '짜장'],
  ['짜장', '자장'],
  ['돈가스', '돈까스'],
  ['돈까스', '돈가스'],
  ['만두국', '만둣국'],
  ['순대국', '순댓국'],
];

/** 같은 음식 판정 키 — 표기 흔들림(짜장/자장·쇠고기/소고기·돈까스/돈가스)은 한쪽으로 모은다 */
export function genericDishKey(name: string): string {
  return compactName(name).replace(/쇠고기/g, '소고기').replace(/자장/g, '짜장').replace(/돈까스/g, '돈가스');
}

/** 이름 뒤에 괄호로 붙이는 부분 표시 ("라면_국물" → "라면 (국물)", "김치찌개_김치만" → "김치찌개 (김치만)") */
const PART_QUAL_RE = /^(국물|면|건더기|양념장|소스|.+만)$/;

/**
 * 데이터셋 식품명("대표식품명_세부1_세부2") → 화면 이름 + 검색용 다른 이름.
 * - "국밥_돼지고기" → "돼지고기 국밥" (aliases: 국밥 돼지고기 · 돼지 국밥 …)
 * - "국밥_순대국밥" · "국수_막국수" → "순대국밥" · "막국수" (세부 이름이 이미 대표 이름으로 끝나면 그것만)
 * - "돼지고기볶음_돼지고기_배추김치" → "배추김치 돼지고기볶음" (대표 이름에 이미 있는 세부는 뺀다)
 * - "돼지고기볶음(제육볶음)" → "돼지고기볶음 (제육볶음)" (aliases: 제육볶음 · 돼지고기볶음 …)
 */
export function cleanGenericName(raw: string): { name: string; aliases: string[] } {
  const s = normalizeDisplayText(raw).replace(/\s+/g, ' ').trim();
  const parts = s.split('_').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { name: '', aliases: [] };
  const head = parts[0];
  const headKey = compactName(head.replace(/\([^)]*\)/g, ''));
  // "라면_국물" · "김치찌개_김치만" 같은 부분 표시는 괄호로 (대표 이름에 들어 있어도 — "라면_면" 은 라면이 아니라 면만)
  const suffix = parts.slice(1).filter((q) => PART_QUAL_RE.test(q));
  let quals = parts.slice(1).filter((q) => !PART_QUAL_RE.test(q) && !headKey.includes(compactName(q)));
  // 세부 이름이 대표 이름으로 끝나면("순대국밥" ← 국밥) 그 세부가 머리가 된다
  const headIdx = quals.findIndex((q) => headKey.length > 0 && compactName(q).endsWith(headKey));
  let words: string[];
  if (headIdx >= 0) words = [...quals.filter((_, i) => i !== headIdx), quals[headIdx]];
  else words = [...quals, head];
  let name = words.join(' ').replace(/\s*\(/g, ' (').replace(/\s+/g, ' ').trim();
  // 부분(국물·면만)은 그 음식 자체가 아니라 다른 이름을 두지 않는다 — "라면 (국물)" 이 "라면" 으로 잡히면 안 된다
  if (suffix.length) return { name: `${name} (${suffix.join(', ')})`, aliases: [] };

  // ── 다른 이름 ──
  const base = new Set<string>([name, parts.join(' ')]);
  // 괄호 앞/속 이름 ("돼지고기볶음 (제육볶음)" → 돼지고기볶음 · 제육볶음, "돼지고기(제육) 덮밥" → 돼지고기 덮밥 · 제육 덮밥)
  for (const v of [...base]) {
    const m = v.match(/^(.*?)(\S+?)\s*\(([^)]+)\)(.*)$/);
    if (!m) continue;
    const [, pre, outer, inner, post] = m;
    base.add(`${pre}${outer}${post}`.trim());
    base.add(`${pre}${inner}${post}`.trim());
  }
  // "삼겹살구이" · "소갈비 구이" → 삼겹살 · 소갈비 (식당에서 "삼겹살"이라 부르는 그 음식)
  for (const v of [...base]) {
    const m = v.match(/^(.*\S{2,}?)\s*구이$/);
    if (m && compactName(m[1]).length >= 2) base.add(m[1].trim());
  }
  const all = new Set<string>(base);
  for (const v of base) for (const [from, to] of SPELLING_SWAPS) if (v.includes(from)) all.add(v.split(from).join(to));
  const own = compactName(name);
  const seen = new Set<string>([own]);
  const aliases: string[] = [];
  for (const a of all) {
    const k = compactName(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    aliases.push(a.replace(/\s+/g, ' ').trim());
  }
  return { name, aliases: aliases.slice(0, 8) };
}

/** 식약처 대분류 → 반찬(한 끼의 주 메뉴가 아님) */
const GENERIC_SIDE_MAJOR = /(김치류|나물|숙채|생채|무침|장아찌|절임|젓갈|장류|양념류)/;
/** 국·찌개 대분류 — 밥이 빠진 값이라 밥은 따로라고 알려 준다 */
const SOUP_MAJOR = /(국 및 탕류|찌개 및 전골류)/;

export interface IngestedDish extends MenuItem {
  _originRank: number;
  _hasPortion: boolean;
  _refDate?: string;
  _code?: string;
}

/**
 * 음식 데이터셋의 일반 음식 행(업체명 '해당없음') → 일반 음식 메뉴.
 * 영양은 데이터셋의 100 g(ml) 당 값 × 식품중량(1인분 제공 중량) — 둘 다 식약처 값이라 official.
 * 식품중량이 없거나 기준량과 같으면(외식 분석 시료 100 g 처럼 1인분이 아닌 값) 1인분을 지어내지 않고 "100 g 기준" + 이유 한 줄.
 */
export function rowToGenericDish(
  row: IngestRow,
): { dish: IngestedDish } | { skip: 'not-generic' | 'origin' | 'no-name' | 'no-kcal' } {
  const cell = (f: Field) => (row.cols[f] == null ? undefined : row.cells[row.cols[f]!]?.trim());
  if (row.kind !== 'food') return { skip: 'not-generic' };
  if (!NO_CATEGORY.has(normalizeDisplayText(cell('company') ?? '').trim())) return { skip: 'not-generic' };
  const origin = genericOrigin(cell('origin'));
  if (!origin) return { skip: 'origin' };
  const rawName = cell('name');
  if (!rawName) return { skip: 'no-name' };
  const { name, aliases } = cleanGenericName(rawName);
  if (!name) return { skip: 'no-name' };

  const basis = parseAmount(cell('basis')) ?? { value: 100, unit: 'g' as const };
  // 식품중량은 단위 없이 숫자만("351.6")이거나 ml 가 잘린 "1100m" 로 오기도 한다 — 기준량 단위로 읽는다
  const wRaw = (cell('weight') ?? '').replace(/,/g, '').trim();
  const wm = wRaw.match(/^(\d+(?:\.\d+)?)\s*(g|ml|m)?$/i);
  const weight: Amount | null =
    wm && Number(wm[1]) > 0 ? { value: Number(wm[1]), unit: wm[2] ? (wm[2].toLowerCase() === 'g' ? 'g' : 'ml') : basis.unit } : null;
  const hasPortion = !!weight && weight.unit === basis.unit && Math.abs(weight.value - basis.value) > 1e-9;
  const num = (f: Field) => parseNumber(cell(f));
  const fmt = (a: Amount) => `${Math.round(a.value)} ${a.unit}`;
  const serving = toServing(
    { kcal: num('kcal'), carbs: num('carbs'), sugar: num('sugar'), protein: num('protein'), fat: num('fat'), satFat: num('satFat'), sodium: num('sodium') },
    cell('basis'),
    hasPortion ? `${weight!.value}${weight!.unit}` : undefined,
    undefined,
  );
  if (!serving) return { skip: 'no-kcal' };

  const majorCat = cell('majorCat') ?? '';
  const repName = cell('repName');
  const hint = repName && !NO_CATEGORY.has(repName) ? `${normalizeDisplayText(repName)} ${name}` : name;
  // 대분류가 곧 음식 성격이다 — 반찬 분류는 side, 음료·빵·빙과만 이름으로 가르고, 나머지 조리 음식(볶음·구이·국·밥…)은 식사
  const category: MenuCategory = GENERIC_SIDE_MAJOR.test(majorCat)
    ? 'side'
    : /(음료|차류|빵|과자|유제품|빙과)/.test(majorCat)
      ? inferCategory(hint, majorCat, cell('midCat'))
      : SALAD_RE.test(name)
        ? 'salad'
        : 'meal';
  const riceApart = SOUP_MAJOR.test(majorCat) && !/(밥|죽|면|국수|수제비|떡국|만두국|만둣국|우동|라면|짬뽕)/.test(name);
  const note = hasPortion
    ? `${origin.label} · ${origin.portion}${riceApart ? '. 국·찌개만의 값이라 공기밥은 따로 더해요' : ''}`
    : `${origin.label} · 1인분 양 정보가 없어 ${fmt(basis)} 기준으로 보여줘요`;
  const code = cell('code');
  const ds = DATASETS.food;
  const dish: IngestedDish = {
    id: `${GENERIC_ID_PREFIX}${code ? slugifyCode(code) : slugifyCode(genericDishKey(name)) || 'item'}`,
    brandId: GENERIC_BRAND_ID,
    name,
    category,
    serving: hasPortion ? `1인분 (${fmt(weight!)})` : `${fmt(basis)} 기준`,
    nutrients: serving.nutrients,
    trust: 'official',
    sourceUrl: ds.url,
    sourceName: ds.sourceName,
    servingNote: note,
    imageKey: category,
    _originRank: origin.rank,
    _hasPortion: hasPortion,
  };
  if (aliases.length) dish.aliases = aliases;
  const ref = cell('refDate');
  if (ref) dish._refDate = ref;
  if (code) dish._code = code;
  return { dish };
}

/**
 * 같은 음식(genericDishKey)은 하나만: 1인분 중량이 있는 행 > 출처 우선순위(외식 분석 > 외식 재료량 > 가정식 > 급식) > 기준일자 최신 > 코드 순.
 * 결과는 출처 우선순위 → 이름 순 (검색 동점일 때 식당 값이 먼저 오게). 진 행의 이름은 이긴 행의 다른 이름으로 남긴다.
 */
export function dedupeGenericDishes(dishes: IngestedDish[]): (MenuItem & { _originRank: number })[] {
  const better = (a: IngestedDish, b: IngestedDish) => {
    if (a._hasPortion !== b._hasPortion) return a._hasPortion;
    if (a._originRank !== b._originRank) return a._originRank < b._originRank;
    const da = a._refDate ?? '';
    const db = b._refDate ?? '';
    if (da !== db) return da > db;
    return (a._code ?? a.id) < (b._code ?? b.id);
  };
  const best = new Map<string, IngestedDish>();
  const names = new Map<string, string[]>();
  for (const d of dishes) {
    const key = genericDishKey(d.name);
    const prev = best.get(key);
    if (!prev || better(d, prev)) best.set(key, d);
    names.set(key, [...(names.get(key) ?? []), d.name, ...(d.aliases ?? [])]);
  }
  const out: (MenuItem & { _originRank: number })[] = [];
  const ids = new Set<string>();
  for (const [key, d] of best) {
    const { _hasPortion, _refDate, _code, ...rest } = d;
    void _hasPortion;
    void _refDate;
    void _code;
    const own = compactName(d.name);
    const seen = new Set<string>([own]);
    const aliases: string[] = [];
    for (const a of [...(d.aliases ?? []), ...(names.get(key) ?? [])]) {
      const k = compactName(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      aliases.push(a);
    }
    const item: MenuItem & { _originRank: number } = { ...rest };
    if (aliases.length) item.aliases = aliases.slice(0, 8);
    else delete item.aliases;
    let id = item.id;
    for (let n = 2; ids.has(id); n++) id = `${item.id}-${n}`;
    ids.add(id);
    out.push({ ...item, id });
  }
  return out.sort((a, b) => a._originRank - b._originRank || a.name.localeCompare(b.name, 'ko'));
}
