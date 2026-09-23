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
 * 합치기(official 20개 이상 브랜드의 시드 estimated 제외 → 같은 브랜드+메뉴명 estimated → official 교체)는
 * 앱 로더(src/data/index.ts)가 mergeMenus 로 한다. 식품명의 분류 접두어("기타차_")는 여기서 뗀다(cleanMenuName).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/generated/mfds.json');
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
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--max-mb');

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
    // 공공데이터 official 이 cutoff 개 이상인 브랜드의 시드 estimated 는 목록에서 뺀다 (src/data/ingest/nutrition.ts mergeMenus)
    seedExcluded: seedPolicy.excluded,
    seedKept: seedPolicy.kept,
    seedExcludedByBrand: seedPolicy.excludedByBrand,
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
const sources = [];
const skips = { 'no-brand': 0, 'no-name': 0, 'no-kcal': 0 };
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
  for (const cells of body) {
    const r = lib.rowToMenu({ kind, cells, cols }, matcher);
    if ('skip' in r) {
      skips[r.skip]++;
      if (r.skip === 'no-brand') {
        const c = (cols.distributor != null && kind === 'processed' ? cells[cols.distributor] : cells[cols.company ?? cols.distributor]) ?? '';
        const k = c.trim();
        if (k && k !== '해당없음' && k !== '-') unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
      }
      continue;
    }
    all.push(r.menu);
    matched++;
  }
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
  `시드 정리(공공데이터 official ${seedPolicy.cutoff}개 이상 브랜드의 시드 estimated 제외): 제외 ${seedPolicy.excluded}개 · 유지 ${seedPolicy.kept}개`,
  seedPolicy.excludedByBrand,
);
console.log('전:', stats(current));
console.log('후:', stats(bundle));

if (DRY) {
  console.log('\n--dry-run: 파일을 쓰지 않았어요.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, serialize(bundle));
  console.log(`\n썼어요: ${OUT}`);
}
