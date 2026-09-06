create table if not exists public.ematica_student_records (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  student_id uuid not null references public.user_profiles(id) on delete cascade,
  class_id text,
  program_id text,
  school_year text,
  full_name text not null default '',
  first_name text,
  last_name text,
  oib text,
  date_of_birth date,
  place_of_birth text,
  address text,
  class_name text,
  program_name text,
  status text not null default 'ACTIVE',
  grade_summary jsonb not null default '{}'::jsonb,
  absence_summary jsonb not null default '{}'::jsonb,
  final_thesis_summary jsonb not null default '{}'::jsonb,
  matura_summary jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ematica_student_records_school_student_unique unique (school_id, student_id)
);

create index if not exists idx_ematica_student_records_school on public.ematica_student_records(school_id);
create index if not exists idx_ematica_student_records_student on public.ematica_student_records(student_id);
create index if not exists idx_ematica_student_records_class on public.ematica_student_records(class_id);

alter table public.ematica_student_records enable row level security;

drop policy if exists "Admins can manage ematica student records" on public.ematica_student_records;
create policy "Admins can manage ematica student records"
on public.ematica_student_records
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

drop trigger if exists set_ematica_student_records_updated_at on public.ematica_student_records;
create trigger set_ematica_student_records_updated_at
before update on public.ematica_student_records
for each row
execute function public.update_updated_at_column();
