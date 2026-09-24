#!/usr/bin/env node
/**
 * 시판 제품 서버 카탈로그(Supabase public.products) 갱신 — 효님 맥 터미널에서 직접 실행.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run upload:products [-- <ndjson 경로>] [--dry-run]
 *
 * - 입력: `npm run ingest:nutrition -- <원본> --server-out <파일>` 결과 (기본 .local/tmp/new-server.ndjson)
 * - 전 행 upsert(id 기준) → 서버에만 있고 새 결과에 없는 행(업소용·묶음 중복 등) 삭제
 * - ref_date 는 보내지 않는다 (인제스트 결과엔 비어 있어 기존 값을 지우지 않게)
 * - service_role 키는 저장하지 말고 실행할 때만 환경변수로 넘긴다 (대시보드 → Project Settings → API)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const input = args.find((a) => !a.startsWith('--')) ?? join(ROOT, '.local/tmp/new-server.ndjson');

const envFile = join(ROOT, '.env');
const env = Object.fromEntries(
  (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const URL_ = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_) throw new Error('.env 에 EXPO_PUBLIC_SUPABASE_URL 이 없어요');
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요해요 (대시보드 → Project Settings → API → service_role / secret 키).');
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const REST = `${URL_}/rest/v1/products`;

async function call(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, init).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) return res;
    const body = await res.text();
    if (i >= tries || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(`${init?.method ?? 'GET'} ${res.status}: ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
}

const rows = readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const { ref_date, ...r } = JSON.parse(l);
    void ref_date;
    return r;
  });
const newIds = new Set(rows.map((r) => r.id));
console.log(`새 카탈로그: ${rows.length}개 (${input})`);

// 서버 id 전체 (키셋 페이지네이션)
const serverIds = [];
for (let last = ''; ; ) {
  const q = `${REST}?select=id&order=id.asc&limit=1000${last ? `&id=gt.${encodeURIComponent(last)}` : ''}`;
  const page = await (await call(q, { headers })).json();
  if (!page.length) break;
  for (const r of page) serverIds.push(r.id);
  last = page[page.length - 1].id;
  if (serverIds.length % 50000 < 1000) process.stdout.write(`\r서버 id 읽는 중… ${serverIds.length}`);
}
const stale = serverIds.filter((id) => !newIds.has(id));
console.log(`\n서버: ${serverIds.length}개 → 삭제 대상 ${stale.length}개, upsert ${rows.length}개`);
if (DRY) {
  console.log('--dry-run: 아무것도 바꾸지 않았어요.');
  process.exit(0);
}

const B = 1000;
for (let i = 0; i < rows.length; i += B) {
  await call(`${REST}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.slice(i, i + B)),
  });
  process.stdout.write(`\rupsert ${Math.min(i + B, rows.length)}/${rows.length}`);
}
console.log();
const D = 150;
for (let i = 0; i < stale.length; i += D) {
  const ids = stale.slice(i, i + D).map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  await call(`${REST}?id=in.(${encodeURIComponent(ids)})`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } });
  process.stdout.write(`\r삭제 ${Math.min(i + D, stale.length)}/${stale.length}`);
}
console.log('\n완료');
