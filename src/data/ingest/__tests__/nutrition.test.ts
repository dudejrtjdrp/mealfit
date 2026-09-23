import { TextDecoder as NodeTextDecoder } from 'util';
import type { Brand, MenuItem } from '../../../domain/types';
import { BRAND_REGISTRY } from '../brandRegistry';
import {
  buildBrandMatcher,
  cleanMenuName,
  coverageOf,
  decodeKoreanText,
  dedupeMenus,
  detectDatasetKind,
  inferCategory,
  matchRowBrand,
  mergeBrands,
  mergeMenus,
  normalizeCompany,
  normalizeMenuName,
  parseAmount,
  parseCsv,
  parseNumber,
  resolveColumns,
  rowToMenu,
  toServing,
  type IngestedMenu,
} from '../nutrition';

const matcher = buildBrandMatcher(BRAND_REGISTRY);

// 전국통합식품영양성분정보(음식) 표준데이터 헤더 (필드 순서·표기는 배포판 기준)
const FOOD_HEADER = [
  '식품코드', '식품명', '데이터구분코드', '데이터구분명', '식품기원코드', '식품기원명', '식품대분류코드', '식품대분류명',
  '대표식품코드', '대표식품명', '식품중분류코드', '식품중분류명', '영양성분함량기준량', '에너지(kcal)', '수분(g)',
  '단백질(g)', '지방(g)', '회분(g)', '탄수화물(g)', '당류(g)', '식이섬유(g)', '나트륨(mg)', '콜레스테롤(mg)',
  '포화지방산(g)', '트랜스지방산(g)', '출처명', '식품중량', '업체명', '데이터기준일자',
];
const PROCESSED_HEADER = [
  '식품코드', '식품명', '식품대분류명', '식품중분류명', '영양성분함량기준량', '에너지(kcal)', '단백질(g)', '지방(g)',
  '탄수화물(g)', '당류(g)', '나트륨(mg)', '포화지방산(g)', '1회 섭취참고량', '식품중량', '제조사명', '유통업체명', '데이터기준일자',
];

function foodRow(v: Record<string, string>): string[] {
  return FOOD_HEADER.map((h) => v[h] ?? '');
}

describe('파일 읽기', () => {
  it('UTF-8 BOM 과 CP949 를 모두 읽는다', () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...Array.from(new TextEncoder().encode('식품명,업체명\n'))]);
    expect(decodeKoreanText(utf8, NodeTextDecoder)).toBe('식품명,업체명\n');
    const cp949 = new Uint8Array([189, 196, 199, 176, 184, 237, 44, 190, 247, 195, 188, 184, 237, 10]);
    expect(decodeKoreanText(cp949, NodeTextDecoder)).toBe('식품명,업체명\n');
  });

  it('CSV 따옴표 안 콤마·줄바꿈·"" 와 CRLF, 빈 줄', () => {
    const rows = parseCsv('a,b,c\r\n"1,2","say ""hi""","x\ny"\r\n\r\n3,,4');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1,2', 'say "hi"', 'x\ny'],
      ['3', '', '4'],
    ]);
  });

  it('헤더 표기 흔들림을 견디고, 지방이 포화지방산·트랜스지방산을 잡지 않는다', () => {
    const cols = resolveColumns(FOOD_HEADER);
    expect(FOOD_HEADER[cols.fat!]).toBe('지방(g)');
    expect(FOOD_HEADER[cols.satFat!]).toBe('포화지방산(g)');
    expect(FOOD_HEADER[cols.kcal!]).toBe('에너지(kcal)');
    expect(FOOD_HEADER[cols.company!]).toBe('업체명');
    const loose = resolveColumns(['식품명', '에너지 (kcal)', '지방 (g)', '상호명', '나트륨(㎎)']);
    expect(loose).toMatchObject({ name: 0, kcal: 1, fat: 2, company: 3, sodium: 4 });
  });

  it('음식·가공식품 표준데이터를 헤더로 구분한다', () => {
    expect(detectDatasetKind(FOOD_HEADER)).toBe('food');
    expect(detectDatasetKind(PROCESSED_HEADER)).toBe('processed');
  });
});

describe('값 정규화', () => {
  it('숫자가 아니면 null — 지어내지 않는다', () => {
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber(' 1,234 ')).toBe(1234);
    expect(parseNumber('0')).toBe(0);
    for (const x of ['', '-', 'Tr', 'N/A', undefined, '-3']) expect(parseNumber(x)).toBeNull();
  });

  it('제공량 문자열', () => {
    expect(parseAmount('100g')).toEqual({ value: 100, unit: 'g' });
    expect(parseAmount('355 mL')).toEqual({ value: 355, unit: 'ml' });
    expect(parseAmount('1인분(300g)')).toEqual({ value: 300, unit: 'g' });
    expect(parseAmount('1.5L')).toEqual({ value: 1500, unit: 'ml' });
    expect(parseAmount('250')).toEqual({ value: 250, unit: 'g' });
    expect(parseAmount('1개')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it.each([
    ['(주)비케이알', '비케이알'],
    ['주식회사 비케이알', '비케이알'],
    ['㈜ 비케이알', '비케이알'],
    ['한국맥도날드(유)', '한국맥도날드'],
    ['Starbucks Coffee Korea Co., Ltd.', 'STARBUCKSCOFFEEKOREA'],
    ['  GS 25 ', 'GS25'],
  ])('업체명 정규화 %s → %s', (raw, want) => {
    expect(normalizeCompany(raw)).toBe(want);
  });

  it('메뉴명 정규화는 공백·기호·규격 괄호만 지운다', () => {
    expect(normalizeMenuName('아이스 카페 아메리카노')).toBe(normalizeMenuName('아이스카페아메리카노'));
    expect(normalizeMenuName('불고기버거(210g)')).toBe(normalizeMenuName('불고기 버거'));
    expect(normalizeMenuName('카페라떼 (Tall)')).toBe(normalizeMenuName('카페라떼'));
    // 뜻이 다른 괄호는 남긴다
    expect(normalizeMenuName('치즈버거(더블)')).not.toBe(normalizeMenuName('치즈버거'));
  });

  it('식품명 앞의 브랜드 접두어를 뗀다 — 단어 경계가 있을 때만', () => {
    expect(cleanMenuName('버거킹_와퍼', ['버거킹'])).toBe('와퍼');
    expect(cleanMenuName('[CU] 백종원 도시락', ['CU'])).toBe('백종원 도시락');
    expect(cleanMenuName('cucumber 샐러드', ['CU'])).toBe('cucumber 샐러드');
    expect(cleanMenuName('닭가슴살_샐러드', ['버거킹'])).toBe('닭가슴살 샐러드');
  });
});

describe('브랜드 매칭', () => {
  it('법인 표기를 지운 뒤 완전 일치로만 매칭한다', () => {
    expect(matchRowBrand(matcher, 'food', '(주)비케이알', undefined)).toBe('burger_king');
    expect(matchRowBrand(matcher, 'food', '한국맥도날드(유)', undefined)).toBe('mcdonalds');
    expect(matchRowBrand(matcher, 'food', '주식회사 스타벅스커피코리아', undefined)).toBe('starbucks');
    expect(matchRowBrand(matcher, 'food', '버거킹 강남점', undefined)).toBeUndefined(); // 부분 일치 금지
    expect(matchRowBrand(matcher, 'food', '', undefined)).toBeUndefined();
  });

  it('여러 브랜드를 가진 법인은 버린다', () => {
    for (const c of ['(주)비알코리아', '롯데지알에스(주)', '(주)파리크라상', '(주)더본코리아', '(주)본아이에프', '(주)신세계푸드', '씨제이푸드빌(주)']) {
      expect(matchRowBrand(matcher, 'food', c, undefined)).toBeUndefined();
    }
  });

  it('가공식품은 유통업체명으로, 편의점 PB 만 받는다', () => {
    expect(matchRowBrand(matcher, 'processed', '(주)한끼식품', '(주)비지에프리테일')).toBe('cu');
    expect(matchRowBrand(matcher, 'processed', '(주)도시락공장', '(주)코리아세븐')).toBe('seven_eleven');
    expect(matchRowBrand(matcher, 'processed', '(주)도시락공장', '(주)지에스리테일')).toBe('gs25');
    // 카페 브랜드 이름의 마트용 제품은 매장 메뉴가 아니다
    expect(matchRowBrand(matcher, 'processed', '(주)이디야', undefined)).toBeUndefined();
  });

  it('레지스트리: id 중복 없음, 기존 시드 12개가 앞에, 업체명 별칭이 두 브랜드에 걸리지 않음', () => {
    const ids = BRAND_REGISTRY.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 12).sort()).toEqual(
      ['gs25', 'cu', 'seven_eleven', 'starbucks', 'mega', 'ediya', 'compose', 'subway', 'salady', 'paris_baguette', 'bonjuk', 'mom_touch'].sort(),
    );
    const owner = new Map<string, string>();
    for (const b of BRAND_REGISTRY) {
      for (const a of [b.name, ...b.companyAliases]) {
        const k = normalizeCompany(a);
        const prev = owner.get(k);
        if (prev) expect(prev).toBe(b.id);
        owner.set(k, b.id);
      }
    }
  });
});

describe('제공량 환산', () => {
  it('100 g 당 수치를 식품중량(1인분)으로 환산한다', () => {
    const r = toServing({ kcal: 250, carbs: 30, sugar: 5.5, protein: 12.3, fat: 9, sodium: 410, satFat: null }, '100g', '220g', undefined);
    expect(r).toEqual({
      nutrients: { kcal: 550, carbs: 66, protein: 27.1, fat: 19.8, sugar: 12.1, sodium: 902 },
      serving: '1인분 (220 g)',
    });
  });

  it('식품중량이 없으면 1회 섭취참고량, 단위가 다르면 쓰지 않는다', () => {
    expect(toServing({ kcal: 40 }, '100ml', '1.5L', undefined)?.serving).toBe('1인분 (1500 ml)');
    expect(toServing({ kcal: 40 }, '100ml', '', '200ml')?.nutrients.kcal).toBe(80);
    // 기준 ml 인데 중량이 g 면 환산하지 않는다
    expect(toServing({ kcal: 40 }, '100ml', '300g', undefined)?.serving).toBe('100 ml 기준');
  });

  it('1인분량이 없으면 100 g 기준임을 servingNote 로 밝히고, 없는 영양소는 비운다', () => {
    const r = toServing({ kcal: 180, sugar: null, sodium: null }, '100g', '', undefined);
    expect(r?.serving).toBe('100 g 기준');
    expect(r?.servingNote).toContain('100 g 기준');
    expect(r?.nutrients).toEqual({ kcal: 180 });
    expect('sugar' in (r?.nutrients ?? {})).toBe(false);
  });

  it('kcal 이 없으면 메뉴를 만들지 않는다', () => {
    expect(toServing({ kcal: null, carbs: 10 }, '100g', '200g', undefined)).toBeNull();
  });
});

describe('행 → 메뉴', () => {
  const cols = resolveColumns(FOOD_HEADER);
  const base = {
    식품코드: 'D301-123456789-0001',
    '식품대분류명': '빵 및 과자류',
    영양성분함량기준량: '100g',
    식품중량: '220g',
    '에너지(kcal)': '250',
    '단백질(g)': '12.3',
    '지방(g)': '9',
    '탄수화물(g)': '30',
    '당류(g)': '5.5',
    '나트륨(mg)': '410',
    '포화지방산(g)': 'Tr',
    업체명: '(주)비케이알',
    데이터기준일자: '2024-12-31',
  };

  it('official · 데이터셋 출처 · 1인분 환산', () => {
    const r = rowToMenu({ kind: 'food', cols, cells: foodRow({ ...base, 식품명: '버거킹_와퍼' }) }, matcher);
    expect('menu' in r).toBe(true);
    const m = (r as { menu: IngestedMenu }).menu;
    expect(m).toMatchObject({
      id: 'burger_king-mfds-d301-123456789-0001',
      brandId: 'burger_king',
      name: '와퍼',
      category: 'meal',
      serving: '1인분 (220 g)',
      trust: 'official',
      sourceUrl: 'https://www.data.go.kr/data/15100070/standard.do',
      sourceName: '식약처·전국통합식품영양성분정보(음식)',
      nutrients: { kcal: 550, protein: 27.1, sodium: 902 },
    });
    expect(m.nutrients?.satFat).toBeUndefined(); // "Tr" 은 숫자가 아니므로 비움
  });

  it('브랜드 없음·kcal 없음은 건너뛴다', () => {
    expect(rowToMenu({ kind: 'food', cols, cells: foodRow({ ...base, 식품명: '김치찌개', 업체명: '' }) }, matcher)).toEqual({ skip: 'no-brand' });
    expect(rowToMenu({ kind: 'food', cols, cells: foodRow({ ...base, 식품명: '와퍼', '에너지(kcal)': '-' }) }, matcher)).toEqual({ skip: 'no-kcal' });
  });

  it('카테고리 추정', () => {
    expect(inferCategory('카페 라떼', '음료류')).toBe('drink');
    expect(inferCategory('초코 머핀', undefined)).toBe('snack');
    expect(inferCategory('치킨 시저 샐러드')).toBe('salad');
    expect(inferCategory('감자튀김(M)')).toBe('side');
    expect(inferCategory('불고기 도시락', '밥류')).toBe('meal');
    expect(inferCategory('불고기버거', '빵 및 과자류')).toBe('meal');
    expect(inferCategory('슈퍼슈프림 피자', '빵 및 과자류')).toBe('meal');
    expect(inferCategory('소보로빵', '빵 및 과자류')).toBe('snack');
    expect(inferCategory('와퍼', '빵 및 과자류', undefined, 'fastfood')).toBe('meal');
    expect(inferCategory('초코 선데이', '빵 및 과자류', undefined, 'fastfood')).toBe('snack');
    expect(inferCategory('돌체 콜드브루', undefined, undefined, 'cafe')).toBe('drink');
    expect(inferCategory('햄치즈 샌드위치', undefined, undefined, 'cafe')).toBe('meal');
  });

  it('같은 브랜드+이름은 기준일자가 최신인 것 하나, id 충돌은 접미사', () => {
    const mk = (id: string, name: string, kcal: number, d: string): IngestedMenu => ({
      id, brandId: 'cu', name, category: 'meal', serving: '1인분', nutrients: { kcal }, trust: 'official', _refDate: d,
    });
    const out = dedupeMenus([mk('a', '참치마요 삼각김밥', 200, '2022-01-01'), mk('b', '참치마요삼각김밥', 210, '2024-01-01'), mk('b', '전주비빔', 180, '2024-01-01')]);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.name.startsWith('참치'))?.nutrients?.kcal).toBe(210);
    expect(new Set(out.map((m) => m.id)).size).toBe(2);
    expect(out.every((m) => !('_refDate' in m))).toBe(true);
  });
});

describe('시드와 합치기', () => {
  const seed: MenuItem[] = [
    {
      id: 'cu-tuna', brandId: 'cu', name: '참치마요 삼각김밥', category: 'meal', serving: '1개 (110 g)', price: 1500,
      nutrients: { kcal: 190 }, trust: 'estimated', blurb: '든든해요.',
      options: [{ id: 'size', label: '사이즈', choices: [{ label: '기본', delta: {}, isDefault: true }, { label: '큰', delta: { kcal: 50 } }] }],
    },
    { id: 'cu-official', brandId: 'cu', name: '공식 메뉴', category: 'meal', serving: '1개', nutrients: { kcal: 300 }, trust: 'official', sourceUrl: 'https://x' },
    { id: 'mega-a', brandId: 'mega', name: '아메리카노', category: 'drink', serving: '1잔', nutrients: null, trust: 'none' },
  ];
  const official: MenuItem[] = [
    { id: 'cu-mfds-1', brandId: 'cu', name: '참치마요삼각김밥', category: 'meal', serving: '1인분 (115 g)', nutrients: { kcal: 205, sodium: 480 }, trust: 'official', sourceUrl: 'https://www.data.go.kr/data/15100066/standard.do', sourceName: '식약처' },
    { id: 'cu-mfds-2', brandId: 'cu', name: '공식 메뉴', category: 'meal', serving: '1인분', nutrients: { kcal: 999 }, trust: 'official', sourceUrl: 'https://y' },
    { id: 'cu-mfds-3', brandId: 'cu', name: '새 도시락', category: 'meal', serving: '1인분 (400 g)', nutrients: { kcal: 700 }, trust: 'official', sourceUrl: 'https://y' },
  ];

  it('estimated 는 공식값으로 교체(id·가격·소개 유지, 추정 옵션 제거), official 시드는 보존, 새 메뉴는 추가', () => {
    const { menus, replaced } = mergeMenus(seed, official);
    expect(replaced).toBe(1);
    const tuna = menus.find((m) => m.id === 'cu-tuna')!;
    expect(tuna).toMatchObject({ trust: 'official', price: 1500, blurb: '든든해요.', serving: '1인분 (115 g)', nutrients: { kcal: 205, sodium: 480 }, sourceName: '식약처' });
    expect(tuna.options).toBeUndefined();
    expect(menus.find((m) => m.id === 'cu-official')?.nutrients?.kcal).toBe(300);
    expect(menus.some((m) => m.id === 'cu-mfds-2')).toBe(false);
    expect(menus.map((m) => m.id)).toEqual(['cu-tuna', 'cu-official', 'mega-a', 'cu-mfds-3']);
    // 입력을 바꾸지 않는다
    expect(seed[0].options).toHaveLength(1);
  });

  it('커버리지를 메뉴 신뢰등급으로 다시 매긴다 (공공데이터가 들어온 브랜드만)', () => {
    expect(coverageOf([])).toBe('none');
    const brands: Brand[] = [
      { id: 'cu', name: 'CU', category: 'convenience', matchKeywords: ['CU'], coverage: 'full' },
      { id: 'mega', name: '메가', category: 'cafe', matchKeywords: ['메가'], coverage: 'none' },
    ];
    const extra: Brand[] = [{ id: 'kfc', name: 'KFC', category: 'fastfood', matchKeywords: ['KFC'], coverage: 'full' }];
    const menus: MenuItem[] = [
      ...seed,
      { id: 'mega-mfds-1', brandId: 'mega', name: '라떼', category: 'drink', serving: '1인분', nutrients: { kcal: 200 }, trust: 'official', sourceUrl: 'https://y' },
      { id: 'kfc-mfds-1', brandId: 'kfc', name: '징거버거', category: 'meal', serving: '1인분', nutrients: { kcal: 500 }, trust: 'official', sourceUrl: 'https://y' },
    ];
    const out = mergeBrands(brands, extra, menus);
    expect(out.map((b) => [b.id, b.coverage])).toEqual([
      ['cu', 'full'],
      ['mega', 'partial'],
      ['kfc', 'full'],
    ]);
  });
});
