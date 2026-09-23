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
  | 'refDate';

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

/** 검색 카탈로그에 싣는 소비자 제품 대분류 → 우선순위 (작을수록 먼저 싣고, 용량 초과 시 뒤부터 뺀다) */
export const PRODUCT_MAJOR_CATEGORIES: Record<string, number> = {
  면류: 0, // 라면·국수
  즉석식품류: 1, // 도시락·김밥·즉석밥
  '과자류·빵류 또는 떡류': 2,
  빙과류: 3,
  '코코아가공품류 또는 초콜릿류': 4,
  음료류: 5,
  유가공품류: 6,
  '식육가공품 및 포장육': 7, // 소시지·햄
};

/** 모든 시판 제품이 공유하는 가상 브랜드 id — 매장 매칭 키워드는 비워 둔다(장소 이름과 매칭되면 안 됨) */
export const PACKAGED_BRAND_ID = 'packaged';

/** 법인 표기를 뗀 화면용 업체명. "오뚜기라면(주)" → "오뚜기라면". 알 수 없으면 undefined */
export function displayCompany(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = normalizeDisplayText(raw)
    .replace(/\(\s*(주|유|사|재|합)\s*\)|㈜|㈔/g, '')
    .replace(/주식회사|유한회사|유한책임회사|농업회사법인|영농조합법인/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || NO_CATEGORY.has(s)) return undefined;
  return s.length > 20 ? `${s.slice(0, 19)}…` : s;
}

export interface IngestedProduct extends MenuItem {
  _refDate?: string;
  /** 용량 초과 시 뒤 카테고리부터 빼기 위한 우선순위 */
  _priority?: number;
}

/**
 * 가공식품 표준데이터 행 → 시판 제품 MenuItem (매장 브랜드에 매칭되지 않은 행용).
 * 소비자 제품 대분류만 받는다 — 식용유·장류·조미식품 같은 재료성 분류는 "지금 사 먹을 것"이 아니라 뺀다.
 */
export function rowToProduct(row: IngestRow): { menu: IngestedProduct } | { skip: SkipReason | 'not-consumer' } {
  const cell = (f: Field) => (row.cols[f] == null ? undefined : row.cells[row.cols[f]!]?.trim());
  const majorCat = cell('majorCat') ?? '';
  const priority = PRODUCT_MAJOR_CATEGORIES[majorCat];
  if (priority === undefined) return { skip: 'not-consumer' };
  const rawName = cell('name');
  if (!rawName) return { skip: 'no-name' };
  const name = normalizeDisplayText(rawName).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
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
    undefined, // 1회 섭취참고량은 표("유탕면(봉지)120g…") 텍스트라 수치로 오독하기 쉬워 쓰지 않는다
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
    serving: serving.serving.replace(/^1인분/, '1개'),
    nutrients: serving.nutrients,
    trust: 'official',
    sourceUrl: ds.url,
    sourceName: ds.sourceName,
    imageKey: category,
  };
  if (serving.servingNote) menu.servingNote = serving.servingNote;
  if (maker) menu.maker = maker;
  if (serving.nutrients.caffeine && serving.nutrients.caffeine > 0) menu.tags = ['카페인 있음'];
  const ref = cell('refDate');
  if (ref) menu._refDate = ref;
  menu._priority = priority;
  return { menu };
}

/** 같은 이름+제조사면 기준일자가 최신인 것 하나만 (수입/재보고 중복 정리). id 충돌은 접미사로 피한다 */
export function dedupeProducts(products: IngestedProduct[]): (MenuItem & { _priority?: number })[] {
  const best = new Map<string, IngestedProduct>();
  for (const p of products) {
    const key = `${normalizeMenuName(p.name)}|${normalizeCompany(p.maker)}`;
    const prev = best.get(key);
    if (!prev || (p._refDate ?? '') > (prev._refDate ?? '')) best.set(key, p);
  }
  const ids = new Set<string>();
  const out: (MenuItem & { _priority?: number })[] = [];
  for (const p of best.values()) {
    const { _refDate, ...rest } = p;
    void _refDate;
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
