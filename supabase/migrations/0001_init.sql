-- =====================================================================
-- mealfit 초기 스키마 (0001_init)
--
-- 실행 방법
--   1) Supabase 대시보드 → 프로젝트 선택 → SQL Editor → New query
--   2) 이 파일 내용을 전부 붙여넣고 Run
--   3) Table Editor 에 profiles · meal_logs · diet_type_cache 가 보이면 끝
--   (Supabase CLI 를 쓴다면: supabase db push)
--
-- 다시 실행해도 깨지지 않도록 if not exists / drop ... if exists 로 작성했습니다.
-- =====================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- updated_at 자동 갱신 트리거 함수
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: 사용자 1명당 1행 (id = auth.users.id)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text not null default '회원',
  sex               text not null check (sex in ('male', 'female')),
  birth_year        integer not null,
  height_cm         numeric not null,
  weight_kg         numeric not null,
  activity          smallint not null check (activity between 1 and 5),
  primary_goal      text not null,
  secondary_goals   text[] not null default '{}',
  target_weight_kg  numeric,
  target_weeks      integer,
  diet_description  text,
  diet              jsonb not null,              -- DietClassification {type, evidence[], source}
  onboarding_done   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- meal_logs: 식사 기록
-- ---------------------------------------------------------------------
create table if not exists public.meal_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,                  -- 사용자 로컬 날짜 (YYYY-MM-DD)
  meal_type      text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  time           timestamptz not null,
  name           text not null,
  brand_id       text,
  store_name     text,
  menu_id        text,
  option_labels  text[],
  nutrients      jsonb not null,                 -- Nutrients {kcal, carbs?, ...}
  trust          text not null check (trust in ('official', 'estimated', 'none', 'user')),
  qty            numeric not null default 1,
  verdict        text check (verdict in ('good', 'ok', 'pass')),
  created_at     timestamptz not null default now()
);

create index if not exists meal_logs_user_date_idx on public.meal_logs (user_id, date);

-- ---------------------------------------------------------------------
-- diet_type_cache: 식단 성향 AI 결과 캐시 (전 사용자 공유)
--   key = sha256(정규화 서술 + 프롬프트 버전). 같은 서술이면 누구든 AI 를 다시 부르지 않는다.
--   서술 원문은 저장하지 않는다 (해시 키만).
-- ---------------------------------------------------------------------
create table if not exists public.diet_type_cache (
  key         text primary key,
  value       jsonb not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.meal_logs       enable row level security;
alter table public.diet_type_cache enable row level security;

-- profiles: 본인 행만
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete to authenticated using (id = auth.uid());

-- meal_logs: 본인 행만
drop policy if exists "meal_logs_select_own" on public.meal_logs;
drop policy if exists "meal_logs_insert_own" on public.meal_logs;
drop policy if exists "meal_logs_update_own" on public.meal_logs;
drop policy if exists "meal_logs_delete_own" on public.meal_logs;
create policy "meal_logs_select_own" on public.meal_logs for select to authenticated using (user_id = auth.uid());
create policy "meal_logs_insert_own" on public.meal_logs for insert to authenticated with check (user_id = auth.uid());
create policy "meal_logs_update_own" on public.meal_logs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_logs_delete_own" on public.meal_logs for delete to authenticated using (user_id = auth.uid());

-- diet_type_cache: 로그인 사용자 누구나 읽기·추가 (수정·삭제는 불가)
drop policy if exists "diet_type_cache_select" on public.diet_type_cache;
drop policy if exists "diet_type_cache_insert" on public.diet_type_cache;
create policy "diet_type_cache_select" on public.diet_type_cache for select to authenticated using (true);
create policy "diet_type_cache_insert" on public.diet_type_cache for insert to authenticated with check (true);
