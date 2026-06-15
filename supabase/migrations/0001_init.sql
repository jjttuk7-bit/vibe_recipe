-- 0001_init.sql — 바이브 레시피 초기 스키마
--
-- DATA_MODEL.md §6 + 헌법 §4 / D-007 / D-008 강제.
-- jsonb 컬럼은 lib/schema.ts의 Zod 스키마와 1:1 매핑된다 (경계 C, welding-inspector 검증 대상).
--
-- 단방향 의존:
--   recipes ──> cook_runs ──> runtime_logs ──> fingerprints
--   recipes ──> recipe_versions (롤백용 히스토리)
--
-- 모든 사용자 데이터 테이블에 RLS 강제. RLS 없는 테이블은 본 마이그레이션에 존재할 수 없다.

-- ─────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- 1. recipes — RecipeState를 jsonb로 (DATA_MODEL.md §1)
-- ─────────────────────────────────────────────────────────────────────────

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes (user_id);

alter table public.recipes enable row level security;

create policy "recipes_select_own"
  on public.recipes for select
  using (auth.uid() = user_id);

create policy "recipes_insert_own"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "recipes_update_own"
  on public.recipes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recipes_delete_own"
  on public.recipes for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. recipe_versions — 빌드/패치 히스토리 (롤백용, DATA_MODEL.md §6)
-- ─────────────────────────────────────────────────────────────────────────

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, version)
);

create index recipe_versions_recipe_id_idx on public.recipe_versions (recipe_id);
create index recipe_versions_user_id_idx on public.recipe_versions (user_id);

alter table public.recipe_versions enable row level security;

create policy "recipe_versions_select_own"
  on public.recipe_versions for select
  using (auth.uid() = user_id);

create policy "recipe_versions_insert_own"
  on public.recipe_versions for insert
  with check (auth.uid() = user_id);

-- 히스토리는 불변. update/delete 정책 없음 → RLS에 의해 자동 차단.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. cook_runs — CookRun (DATA_MODEL.md §2)
-- step_events는 jsonb 배열: [{ step_index, type, note?, timestamp }]
-- type은 "done" | "timer_done" | "hotfix" | "failed_here" (D-006: hotfix 포함)
-- outcome은 "good" | "meh" | "failed" | NULL (Postmortem 미진입 시 NULL)
-- ─────────────────────────────────────────────────────────────────────────

create table public.cook_runs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed boolean not null default false,
  outcome text check (outcome in ('good', 'meh', 'failed')),
  step_events jsonb not null default '[]'::jsonb
);

create index cook_runs_recipe_id_idx on public.cook_runs (recipe_id);
create index cook_runs_user_id_idx on public.cook_runs (user_id);

alter table public.cook_runs enable row level security;

create policy "cook_runs_select_own"
  on public.cook_runs for select
  using (auth.uid() = user_id);

create policy "cook_runs_insert_own"
  on public.cook_runs for insert
  with check (auth.uid() = user_id);

create policy "cook_runs_update_own"
  on public.cook_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 조리 기록 삭제는 해자(Fingerprint)를 파괴하는 행위 → 본인이라도 별도 검토 필요.
-- delete 정책 없음 → RLS에 의해 자동 차단. (필요 시 별도 ADR로 추가.)

-- ─────────────────────────────────────────────────────────────────────────
-- 4. runtime_logs — RuntimeLog (DATA_MODEL.md §3)
-- recipe_id가 PK. 레시피 1개당 1행. cook_runs 집계 결과로 갱신.
-- ─────────────────────────────────────────────────────────────────────────

create table public.runtime_logs (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_runs integer not null default 0 check (total_runs >= 0),
  known_issues jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index runtime_logs_user_id_idx on public.runtime_logs (user_id);

alter table public.runtime_logs enable row level security;

create policy "runtime_logs_select_own"
  on public.runtime_logs for select
  using (auth.uid() = user_id);

create policy "runtime_logs_insert_own"
  on public.runtime_logs for insert
  with check (auth.uid() = user_id);

create policy "runtime_logs_update_own"
  on public.runtime_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. fingerprints — Fingerprint (DATA_MODEL.md §4, D-007 해자)
-- user_id가 PK. 유저 1명당 1행. 여러 runtime_logs를 가로질러 집계.
-- ─────────────────────────────────────────────────────────────────────────

create table public.fingerprints (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_runs_all_recipes integer not null default 0 check (total_runs_all_recipes >= 0),
  traits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fingerprints enable row level security;

create policy "fingerprints_select_own"
  on public.fingerprints for select
  using (auth.uid() = user_id);

create policy "fingerprints_insert_own"
  on public.fingerprints for insert
  with check (auth.uid() = user_id);

create policy "fingerprints_update_own"
  on public.fingerprints for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Phase 2에서 집단 지성을 도입할 때 별도 익명 집계 테이블 추가 (본 테이블은 본인만).

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_touch_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

create trigger runtime_logs_touch_updated_at
  before update on public.runtime_logs
  for each row execute function public.touch_updated_at();

create trigger fingerprints_touch_updated_at
  before update on public.fingerprints
  for each row execute function public.touch_updated_at();
