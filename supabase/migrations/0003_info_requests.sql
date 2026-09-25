-- =====================================================================
-- 0003_info_requests: "이 매장 정보 요청하기" (D6 정보 없음 화면)
--
-- 영양 정보가 아직 없는 매장을 사용자가 요청하면 한 행이 쌓인다.
-- 요청이 많은 매장부터 데이터를 추가하는 데 쓴다 (앱은 약속하지 않고 "모아서 먼저 추가할게요"라고만 말한다).
-- 앱은 이 테이블이 없어도 동작한다 — insert 가 실패하면 기기(AsyncStorage)에 보관했다가 다음 요청 때 다시 올린다.
--
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣고 Run (다시 실행해도 깨지지 않게 작성)
-- =====================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists public.info_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_key     text not null,             -- 앱의 requestKey(): place:<카카오 id> | brand:<브랜드 id> | name:<정규화 이름>
  store_name      text not null,             -- "본죽 역삼점"
  brand_id        text,                      -- 앱 브랜드 id (모르면 null)
  kakao_place_id  text,                      -- 카카오 로컬 place id (목 매장이면 null)
  created_at      timestamptz not null default now(),
  -- 한 사람이 같은 매장을 두 번 요청하지 않게 (앱은 23505 를 "이미 요청함"으로 처리)
  constraint info_requests_user_key unique (user_id, request_key)
);

-- 집계용: 어떤 매장이 많이 요청됐는지
create index if not exists info_requests_key_idx on public.info_requests (request_key);

alter table public.info_requests enable row level security;

-- 로그인 사용자는 자기 요청만 넣고 볼 수 있다. 수정·삭제 정책 없음 = 불가. 익명(anon)은 권한 자체가 없다.
drop policy if exists "info_requests_select_own" on public.info_requests;
drop policy if exists "info_requests_insert_own" on public.info_requests;
create policy "info_requests_select_own" on public.info_requests for select to authenticated using (user_id = auth.uid());
create policy "info_requests_insert_own" on public.info_requests for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Data API 권한 (GRANT) — 2026-10-30 Supabase 자동 권한 부여 중단 대비 (0001 과 같은 규칙)
--   개인 데이터라 anon 에게는 주지 않는다. 집계·정리는 service_role.
-- ---------------------------------------------------------------------
grant select, insert on public.info_requests to authenticated;

grant select, insert, update, delete on public.info_requests to service_role;
