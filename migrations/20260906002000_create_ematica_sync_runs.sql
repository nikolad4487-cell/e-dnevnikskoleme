create table if not exists public.ematica_sync_runs (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  triggered_by uuid references public.user_profiles(id) on delete set null,
  mode text not null default 'PREPARE' check (mode in ('PREPARE', 'SYNC')),
  status text not null default 'COMPLETED' check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  source_system text not null default 'e-Dnevnik',
  target_system text not null default 'e-Matica',
  students_count integer not null default 0,
  classes_count integer not null default 0,
  issues_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ematica_sync_runs_school on public.ematica_sync_runs(school_id);
create index if not exists idx_ematica_sync_runs_created_at on public.ematica_sync_runs(created_at desc);

alter table public.ematica_sync_runs enable row level security;

drop policy if exists "Admins can manage ematica sync runs" on public.ematica_sync_runs;
create policy "Admins can manage ematica sync runs"
on public.ematica_sync_runs
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and (
        up.role in ('MAIN_ADMIN', 'ADMIN', 'SCHOOL_ADMIN')
        or up.access_role in ('MAIN_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'super_admin')
      )
  )
)
with check (true);
