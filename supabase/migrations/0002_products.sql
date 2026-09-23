-- =====================================================================
-- 0002_products: 시판 가공식품 전체 카탈로그 (식약처 전국통합식품영양성분정보)
--
-- 앱 번들(mfds-products.json 3.7만 개)은 오프라인·키 없음 폴백이고,
-- 검색의 기본은 이 테이블(유일 제품 26만여 개)이다 — 2026-09-24 효님 결정.
-- 업로드는 scripts/ingest-nutrition.mjs 의 --server-out 결과를 REST 로 넣는다.
--
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣고 Run
-- =====================================================================

create extension if not exists pg_trgm;

create table if not exists public.products (
  id           text primary key,          -- pkg-<식품코드>
  name         text not null,
  name_norm    text not null,             -- 소문자·공백·기호 제거 (앱 normalizeName 과 동일 규칙)
  maker        text,                      -- 제조사 표시명 ("농심")
  maker_norm   text,
  category     text not null,             -- drink | meal | snack | salad | side
  serving      text not null,             -- "1개 (120 g)" | "100 g 기준"
  serving_note text,
  kcal         real not null,
  carbs        real,
  protein      real,
  fat          real,
  sat_fat      real,
  sugar        real,
  sodium       real,
  caffeine     real,
  ref_date     text                       -- 데이터기준일자 (재업로드 때 최신 판별)
);

-- 부분 문자열 검색("라면" → 신라면)을 위한 트라이그램 인덱스
create index if not exists products_name_trgm  on public.products using gin (name_norm gin_trgm_ops);
create index if not exists products_maker_trgm on public.products using gin (maker_norm gin_trgm_ops);

alter table public.products enable row level security;

-- 카탈로그는 공개 데이터: 누구나 읽기, 쓰기는 service_role 만 (정책 없음 = 차단)
drop policy if exists "products_read_all" on public.products;
create policy "products_read_all" on public.products for select using (true);
