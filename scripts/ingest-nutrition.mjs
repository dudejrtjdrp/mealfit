#!/usr/bin/env node
/**
 * 식약처 전국통합식품영양성분정보 표준데이터(음식·가공식품) CSV → src/data/generated/mfds.json
 *
 * 사용:
 *   npm run ingest:nutrition -- <CSV 파일 또는 폴더 ...> [--dry-run] [--max-mb 5]
 *   npm run ingest:nutrition -- --stats          # 지금 번들 데이터 통계만
 *
 * 인자가 없으면 $NUTRITION_RAW_DIR, 그다음 .local/nutrition-raw/ 의 *.csv 를 읽는다.
 * 원본 CSV(수십 MB)는 레포에 넣지 않는다 — .local/ 은 gitignore 대상.
 *
 * 원본 받는 곳 (로그인 없이 "CSV 다운로드"):
 *   음식      https://www.data.go.kr/data/15100070/standard.do
 *   가공식품  https://www.data.go.kr/data/15100066/standard.do
 * 인코딩(UTF-8/CP949)과 음식·가공식품 구분은 파일 헤더로 자동 판별한다.
 *
 * 재실행 안전: 매번 원본에서 mfds.json 을 통째로 다시 만든다. 손으로 고친 시드(menus.json·brands.json)는 건드리지 않고,
 * 합치기(official 20개 이상 브랜드의 옵션 없는 시드 estimated 제외 → 같은 브랜드+메뉴명 estimated → official 교체)는
 * 앱 로더(src/data/index.ts)가 mergeMenus 로 한다. 식품명의 분류 접두어("기타차_")는 여기서 뗀다(cleanMenuName).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/generated/mfds.json');
const OUT_PRODUCTS = join(ROOT, 'src/data/generated/mfds-products.json');
const SEED_MENUS = join(ROOT, 'src/data/menus.json');
const SEED_BRANDS = join(ROOT, 'src/data/brands.json');

const lib = await import(join(ROOT, 'src/data/ingest/nutrition.ts'));
const { BRAND_REGISTRY } = await import(join(ROOT, 'src/data/ingest/brandRegistry.ts'));

// ───────── 인자 ─────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const DRY = flag('--dry-run');
const STATS_ONLY = flag('--stats');
const MAX_BYTES = Math.round(Number(opt('--max-mb', '5')) * 1024 * 1024);
// 시판 제품(mfds-products.json)은 검색 때만 지연 로드하는 별도 파일 — 시작 성능과 무관해 상한을 따로 둔다
const MAX_PRODUCT_BYTES = Math.round(Number(opt('--max-products-mb', '10')) * 1024 * 1024);
// --server-out <경로>: 정원 없이 전체 유일 제품을 Supabase products 테이블 업로드용 NDJSON 으로 쓴다 (0002_products.sql 참고)
const SERVER_OUT = opt('--server-out', null);
const OPT_FLAGS = ['--max-mb', '--max-products-mb', '--server-out'];
const positional = args.filter((a, i) => !a.startsWith('--') && !OPT_FLAGS.includes(args[i - 1]));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const seedMenus = readJson(SEED_MENUS);
const seedBrands = readJson(SEED_BRANDS);

function serialize(bundle) {
  // 한 메뉴 = 한 줄: git diff 가 읽히고, 들여쓰기 공백으로 용량을 낭비하지 않는다
  const line = (x) => JSON.stringify(x);
  return (
    '{\n' +
    `"meta": ${JSON.stringify(bundle.meta, null, 2)},\n` +
    `"brands": [${bundle.brands.length ? '\n' + bundle.brands.map(line).join(',\n') + '\n' : ''}],\n` +
    `"menus": [${bundle.menus.length ? '\n' + bundle.menus.map(line).join(',\n') + '\n' : ''}]\n` +
    '}\n'
  );
}

function stats(bundle) {
  const { menus, seedPolicy } = lib.mergeMenus(seedMenus, bundle.menus);
  const brands = lib.mergeBrands(seedBrands, bundle.brands, menus);
  const trust = {};
  for (const m of menus) trust[m.trust] = (trust[m.trust] ?? 0) + 1;
  const pct = (n) => `${(((n ?? 0) / menus.length) * 100).toFixed(1)}%`;
  const bytes =
    Buffer.byteLength(readFileSync(SEED_MENUS)) + Buffer.byteLength(readFileSync(SEED_BRANDS)) + Buffer.byteLength(serialize(bundle));
  return {
    brands: brands.length,
    menus: menus.length,
    official: `${trust.official ?? 0} (${pct(trust.official)})`,
    estimated: `${trust.estimated ?? 0} (${pct(trust.estimated)})`,
    none: `${trust.none ?? 0} (${pct(trust.none)})`,
    user: trust.user ?? 0,
    // 공공데이터 official 이 cutoff 개 이상인 브랜드의 옵션 없는 시드 estimated 는 목록에서 뺀다 (src/data/ingest/nutrition.ts mergeMenus)
    seedExcluded: seedPolicy.excluded,
    seedKept: seedPolicy.kept,
    seedExcludedByBrand: seedPolicy.excludedByBrand,
    seedKeptWithOptions: seedPolicy.keptWithOptions,
    seedKeptWithOptionsByBrand: seedPolicy.keptWithOptionsByBrand,
    jsonBytes: bytes,
    jsonMB: (bytes / 1024 / 1024).toFixed(2),
  };
}

const EMPTY = { meta: { generatedAt: null, sources: [], note: '아직 인제스트한 원본이 없어요. scripts/ingest-nutrition.mjs 참고' }, brands: [], menus: [] };
const current = existsSync(OUT) ? readJson(OUT) : EMPTY;

if (STATS_ONLY) {
  console.log('시드만:', stats(EMPTY));
  console.log('현재 번들(시드+공공데이터):', stats(current));
  process.exit(0);
}

// ───────── 입력 파일 ─────────
function collect(p) {
  if (!existsSync(p)) throw new Error(`파일·폴더가 없어요: ${p}`);
  if (statSync(p).isDirectory()) return readdirSync(p).filter((f) => /\.csv$/i.test(f)).sort().map((f) => join(p, f));
  return [p];
}
const inputs = positional.length ? positional : [process.env.NUTRITION_RAW_DIR ?? join(ROOT, '.local/nutrition-raw')];
let files;
try {
  files = inputs.flatMap((p) => collect(resolve(p)));
} catch (e) {
  console.error(String(e.message ?? e));
  files = [];
}
if (files.length === 0) {
  console.error('읽을 CSV 가 없어요. 사용: npm run ingest:nutrition -- <CSV 또는 폴더>');
  process.exit(1);
}

// ───────── 변환 ─────────
const matcher = lib.buildBrandMatcher(BRAND_REGISTRY);
const all = [];
const allProducts = [];
const sources = [];
const skips = { 'no-brand': 0, 'no-name': 0, 'no-kcal': 0 };
const productSkips = { 'not-consumer': 0, 'no-name': 0, 'no-kcal': 0 };
const unmatched = new Map();

for (const file of files) {
  const buf = readFileSync(file);
  const rows = lib.parseCsv(lib.decodeKoreanText(new Uint8Array(buf)));
  const [header, ...body] = rows;
  const kind = lib.detectDatasetKind(header);
  const cols = lib.resolveColumns(header);
  const missing = ['name', 'kcal'].filter((f) => cols[f] == null);
  if (cols.company == null && cols.distributor == null) missing.push('업체명/유통업체명');
  if (missing.length) {
    console.error(`[건너뜀] ${basename(file)}: 필수 열이 없어요 (${missing.join(', ')}). 헤더: ${header.slice(0, 12).join(' | ')} ...`);
    continue;
  }
  let matched = 0;
  let productCount = 0;
  for (const cells of body) {
    const r = lib.rowToMenu({ kind, cells, cols }, matcher);
    if ('skip' in r) {
      skips[r.skip]++;
      if (r.skip === 'no-brand') {
        const c = (cols.distributor != null && kind === 'processed' ? cells[cols.distributor] : cells[cols.company ?? cols.distributor]) ?? '';
        const k = c.trim();
        if (k && k !== '해당없음' && k !== '-') unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
        // 매장 브랜드가 아닌 가공식품은 시판 제품 카탈로그(검색용)로 보낸다 — 라면·과자·음료가 여기서 산다
        if (kind === 'processed') {
          const p = lib.rowToProduct({ kind, cells, cols });
          if ('skip' in p) productSkips[p.skip] = (productSkips[p.skip] ?? 0) + 1;
          else {
            allProducts.push(p.menu);
            productCount++;
          }
        }
      }
      continue;
    }
    all.push(r.menu);
    matched++;
  }
  if (kind === 'processed') console.log(`[제품] ${basename(file)}: 시판 제품 후보 ${productCount}`);
  sources.push({
    file: basename(file),
    kind,
    url: lib.DATASETS[kind].url,
    rows: body.length,
    matched,
    sha256: createHash('sha256').update(buf).digest('hex'),
  });
  console.log(`[읽음] ${basename(file)} (${kind}) 행 ${body.length} → 브랜드 매칭 ${matched}`);
}

let menus = lib.dedupeMenus(all);

// ───────── 우선순위·용량 ─────────
const priority = new Map(BRAND_REGISTRY.map((b, i) => [b.id, i]));
menus.sort((a, b) => priority.get(a.brandId) - priority.get(b.brandId) || a.name.localeCompare(b.name, 'ko'));

const seedBrandIds = new Set(seedBrands.map((b) => b.id));
const buildBundle = (ms) => {
  const used = new Set(ms.map((m) => m.brandId));
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sources,
      note: '자동 생성 파일 — 손으로 고치지 말고 scripts/ingest-nutrition.mjs 를 다시 실행하세요',
    },
    brands: BRAND_REGISTRY.filter((b) => used.has(b.id) && !seedBrandIds.has(b.id)).map(lib.registryToBrand),
    menus: ms,
  };
};

let bundle = buildBundle(menus);
const dropped = [];
const totalBytes = (b) => Buffer.byteLength(readFileSync(SEED_MENUS)) + Buffer.byteLength(readFileSync(SEED_BRANDS)) + Buffer.byteLength(serialize(b));
while (totalBytes(bundle) > MAX_BYTES && menus.length) {
  // 우선순위가 가장 낮은 브랜드부터 통째로 뺀다 (한 브랜드의 메뉴를 반만 싣지 않는다)
  const last = menus[menus.length - 1].brandId;
  dropped.push({ brandId: last, menus: menus.filter((m) => m.brandId === last).length });
  menus = menus.filter((m) => m.brandId !== last);
  bundle = buildBundle(menus);
}
if (dropped.length) bundle.meta.droppedForSize = dropped;

// ───────── 보고 ─────────
const perBrand = {};
for (const m of menus) perBrand[m.brandId] = (perBrand[m.brandId] ?? 0) + 1;
console.log('\n건너뛴 행:', skips);
console.log('브랜드별 official 메뉴:', perBrand);
if (dropped.length) console.log(`용량 ${MAX_BYTES} B 초과로 뺀 브랜드:`, dropped);
const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
if (top.length) console.log('\n매칭 안 된 업체명 상위 (brandRegistry 에 추가할 후보 — 한 법인 = 한 브랜드일 때만):\n' + top.map(([k, n]) => `  ${n}\t${k}`).join('\n'));
const { replaced, seedPolicy } = lib.mergeMenus(seedMenus, bundle.menus);
console.log(`\n시드 estimated/none → official 교체: ${replaced}개`);
console.log(
  `시드 정리(공공데이터 official ${seedPolicy.cutoff}개 이상 브랜드의 옵션 없는 시드 estimated 제외): 제외 ${seedPolicy.excluded}개 · 유지 ${seedPolicy.kept}개` +
    ` (그중 옵션 있어 남긴 추정 ${seedPolicy.keptWithOptions}개)`,
  { 제외: seedPolicy.excludedByBrand, 옵션유지: seedPolicy.keptWithOptionsByBrand },
);
console.log('전:', stats(current));
console.log('후:', stats(bundle));

// ───────── 시판 제품 번들 ─────────
// 전체 원본(가공식품 표준 API)은 59만 행 → 이름+제조사 유일 26만 개라 다 실을 수 없다.
// 카테고리별 정원 + 정원 초과 시 "제조사의 등록 제품 수가 많은 순"(대형 제조사 = 소비자가 실제로 찾는 브랜드일 확률이 높은 proxy)으로 고른다.
const PRODUCT_QUOTA = {
  면류: 4000, 즉석식품류: 6000, '과자류·빵류 또는 떡류': 8000, 빙과류: 2000, '코코아가공품류 또는 초콜릿류': 2000,
  음료류: 5000, 유가공품류: 2000, '식육가공품 및 포장육': 2500, 수산가공식품류: 1500, '두부류 또는 묵류': 500,
  농산가공식품류: 1500, '절임류 또는 조림류': 500, 당류: 300, 잼류: 300, 알가공품류: 200,
  특수영양식품: 800, 기타식품류: 300, 동물성가공식품류: 100, '벌꿀 및 화분가공 식품류': 10, 주류: 30,
};
const deduped = lib.dedupeProducts(allProducts);
const makerFreq = new Map();
for (const p of deduped) {
  const k = lib.normalizeCompany(p.maker);
  if (k) makerFreq.set(k, (makerFreq.get(k) ?? 0) + 1);
}
// 소비자가 이름으로 찾는 유명 제조사는 등록 수와 무관하게 먼저 싣는다 (코카콜라처럼 제품 수는 적어도 검색은 많은 브랜드)
const MAJOR_MAKERS = ['농심', '오뚜기', '삼양식품', '팔도', '롯데', '해태', '오리온', '크라운', '빙그레', '코카콜라', '동서', '매일유업', '서울우유', '남양유업', '씨제이', 'CJ', '대상', '풀무원', '동원', '사조', '샘표', '정식품', '웅진', '광동', '동아오츠카', '하이트진로', '델몬트', '목우촌', '하림', '진주햄', 'SPC', '삼립', '파리크라상', '해찬들', '청정원', '제주특별자치도개발공사', '일화'].map(lib.normalizeCompany);
const isMajor = (makerKey) => !!makerKey && MAJOR_MAKERS.some((m) => makerKey.includes(m));
const priorityToCat = new Map(Object.entries(lib.PRODUCT_MAJOR_CATEGORIES).map(([k, v]) => [v, k]));
const byCat = new Map();
for (const p of deduped) {
  const list = byCat.get(p._priority) ?? [];
  list.push(p);
  byCat.set(p._priority, list);
}
let products = [];
const quotaCut = {};
for (const pr of [...byCat.keys()].sort((a, b) => a - b)) {
  const cat = priorityToCat.get(pr) ?? String(pr);
  const list = byCat.get(pr).sort((a, b) => {
    const ka = lib.normalizeCompany(a.maker);
    const kb = lib.normalizeCompany(b.maker);
    return (isMajor(kb) ? 1 : 0) - (isMajor(ka) ? 1 : 0) || (makerFreq.get(kb) ?? 0) - (makerFreq.get(ka) ?? 0) || a.name.localeCompare(b.name, 'ko');
  });
  const quota = PRODUCT_QUOTA[cat] ?? 300;
  if (list.length > quota) quotaCut[cat] = list.length - quota;
  products.push(...list.slice(0, quota));
}
if (Object.keys(quotaCut).length) console.log('\n정원 초과로 뺀 제품(카테고리: 뺀 수):', quotaCut);

// ───────── 서버 업로드용 전체 제품 (정원 없음) ─────────
if (SERVER_OUT) {
  // 앱 검색 정규화(normalizeName)와 같은 규칙 — 서버 ilike 검색 키
  const norm = (s) => (s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const lines = deduped.map((p) => {
    const n = p.nutrients;
    return JSON.stringify({
      id: p.id,
      name: p.name,
      name_norm: norm(p.name),
      maker: p.maker ?? null,
      maker_norm: p.maker ? norm(p.maker) : null,
      category: p.category,
      serving: p.serving,
      serving_note: p.servingNote ?? null,
      kcal: n.kcal,
      carbs: n.carbs ?? null,
      protein: n.protein ?? null,
      fat: n.fat ?? null,
      sat_fat: n.satFat ?? null,
      sugar: n.sugar ?? null,
      sodium: n.sodium ?? null,
      caffeine: n.caffeine ?? null,
      ref_date: p._refDate ?? null,
    });
  });
  writeFileSync(SERVER_OUT, lines.join('\n') + '\n');
  console.log(`\n서버 업로드용 전체 제품: ${lines.length}개 → ${SERVER_OUT} (${(Buffer.byteLength(lines.join('\n')) / 1024 / 1024).toFixed(1)} MB)`);
}
// 출처 URL·이름·brandId 는 전 항목이 같아 메타에 한 번만 싣는다 — 로더(src/data/index.ts)가 다시 채운다
const serializeProducts = (ms) =>
  '{\n' +
  `"meta": ${JSON.stringify({ generatedAt: new Date().toISOString(), source: lib.DATASETS.processed, brandId: lib.PACKAGED_BRAND_ID, count: ms.length, note: '자동 생성 파일 — scripts/ingest-nutrition.mjs' }, null, 2)},\n` +
  `"menus": [${ms.length ? '\n' + ms.map((m) => { const { _priority, sourceUrl, sourceName, brandId, ...rest } = m; void _priority; void sourceUrl; void sourceName; void brandId; return JSON.stringify(rest); }).join(',\n') + '\n' : ''}]\n` +
  '}\n';
// 정원을 채우고도 바이트 상한을 넘으면 우선순위가 낮은 쪽 끝에서 항목 단위로 덜어낸다
const droppedProducts = {};
let bytes = Buffer.byteLength(serializeProducts(products));
while (bytes > MAX_PRODUCT_BYTES && products.length) {
  const cut = Math.max(200, Math.ceil(products.length * 0.03));
  for (const p of products.slice(-cut)) {
    const cat = priorityToCat.get(p._priority) ?? String(p._priority);
    droppedProducts[cat] = (droppedProducts[cat] ?? 0) + 1;
  }
  products = products.slice(0, -cut);
  bytes = Buffer.byteLength(serializeProducts(products));
}
const productBytes = Buffer.byteLength(serializeProducts(products));
const perCat = {};
for (const p of products) perCat[p._priority ?? 99] = (perCat[p._priority ?? 99] ?? 0) + 1;
const catName = (pr) => Object.entries(lib.PRODUCT_MAJOR_CATEGORIES).find(([, v]) => v === Number(pr))?.[0] ?? pr;
console.log('\n시판 제품:', products.length, '개 /', (productBytes / 1024 / 1024).toFixed(2), 'MB', '| 건너뜀:', productSkips);
console.log('제품 분류별:', Object.fromEntries(Object.entries(perCat).map(([k, v]) => [catName(k), v])));
if (Object.keys(droppedProducts).length)
  console.log('용량 초과로 뺀 분류:', Object.fromEntries(Object.entries(droppedProducts).map(([k, v]) => [catName(k), v])));

if (DRY) {
  console.log('\n--dry-run: 파일을 쓰지 않았어요.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, serialize(bundle));
  writeFileSync(OUT_PRODUCTS, serializeProducts(products));
  console.log(`\n썼어요: ${OUT}`);
  console.log(`썼어요: ${OUT_PRODUCTS}`);
}
