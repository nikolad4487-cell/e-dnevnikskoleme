create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.matura_settings (
  id uuid primary key default gen_random_uuid(),
  school_id text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  cancellation_closes_at timestamptz,
  study_program_changes_opens_at timestamptz,
  study_program_changes_close_at timestamptz,
  study_program_withdrawal_closes_at timestamptz,
  objection_opens_at timestamptz,
  objection_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matura_settings_school_unique unique (school_id)
);

alter table public.matura_settings drop constraint if exists matura_settings_school_id_fkey;
alter table public.matura_settings add column if not exists school_id text;
alter table public.matura_settings alter column school_id type text using school_id::text;
alter table public.matura_settings add column if not exists registration_opens_at timestamptz;
alter table public.matura_settings add column if not exists registration_closes_at timestamptz;
alter table public.matura_settings add column if not exists cancellation_closes_at timestamptz;
alter table public.matura_settings add column if not exists study_program_changes_opens_at timestamptz;
alter table public.matura_settings add column if not exists study_program_changes_close_at timestamptz;
alter table public.matura_settings add column if not exists study_program_withdrawal_closes_at timestamptz;
alter table public.matura_settings add column if not exists objection_opens_at timestamptz;
alter table public.matura_settings add column if not exists objection_closes_at timestamptz;
alter table public.matura_settings add column if not exists created_at timestamptz not null default now();
alter table public.matura_settings add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_matura_settings_school on public.matura_settings(school_id);

alter table public.matura_settings enable row level security;

drop policy if exists "Matura settings are readable" on public.matura_settings;
create policy "Matura settings are readable"
on public.matura_settings
for select
using (true);

drop policy if exists "School admins can manage matura settings" on public.matura_settings;
create policy "School admins can manage matura settings"
on public.matura_settings
for all
to authenticated
using (true)
with check (true);

drop trigger if exists set_matura_settings_updated_at on public.matura_settings;
create trigger set_matura_settings_updated_at
before update on public.matura_settings
for each row
execute function public.update_updated_at_column();

create table if not exists public.matura_exam_schedule (
  id uuid primary key default gen_random_uuid(),
  school_id text,
  subject text not null,
  subject_name text not null,
  level text not null default 'ONE' check (level in ('ONE', 'A', 'B', '-', 'A_RAZINA', 'B_RAZINA', 'JEDNA_RAZINA')),
  exam_at timestamptz not null,
  starts_at timestamptz not null,
  room text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matura_exam_schedule drop constraint if exists matura_exam_schedule_school_id_fkey;
alter table public.matura_exam_schedule add column if not exists school_id text;
alter table public.matura_exam_schedule alter column school_id type text using school_id::text;
alter table public.matura_exam_schedule add column if not exists subject text;
alter table public.matura_exam_schedule add column if not exists subject_name text;
alter table public.matura_exam_schedule add column if not exists exam_at timestamptz;
alter table public.matura_exam_schedule add column if not exists starts_at timestamptz;
update public.matura_exam_schedule
set subject = coalesce(subject, subject_name),
    subject_name = coalesce(subject_name, subject),
    exam_at = coalesce(exam_at, starts_at),
    starts_at = coalesce(starts_at, exam_at)
where subject is null or subject_name is null or exam_at is null or starts_at is null;
alter table public.matura_exam_schedule alter column subject set default 'Hrvatski jezik';
alter table public.matura_exam_schedule alter column subject set not null;
alter table public.matura_exam_schedule alter column subject_name set default 'Hrvatski jezik';
alter table public.matura_exam_schedule alter column subject_name set not null;
alter table public.matura_exam_schedule add column if not exists level text not null default 'JEDNA_RAZINA';
update public.matura_exam_schedule
set level = case
  when level = 'A_RAZINA' then 'A'
  when level = 'B_RAZINA' then 'B'
  when level is null or level in ('JEDNA_RAZINA', '-') then 'ONE'
  else level
end;
alter table public.matura_exam_schedule drop constraint if exists matura_exam_schedule_level_valid;
alter table public.matura_exam_schedule drop constraint if exists matura_exam_schedule_level_check;
alter table public.matura_exam_schedule alter column level set default 'ONE';
alter table public.matura_exam_schedule add constraint matura_exam_schedule_level_valid check (level in ('ONE', 'A', 'B', '-', 'A_RAZINA', 'B_RAZINA', 'JEDNA_RAZINA'));
alter table public.matura_exam_schedule alter column exam_at set default now();
alter table public.matura_exam_schedule alter column exam_at set not null;
alter table public.matura_exam_schedule alter column starts_at set default now();
alter table public.matura_exam_schedule alter column starts_at set not null;
alter table public.matura_exam_schedule add column if not exists room text;
alter table public.matura_exam_schedule add column if not exists note text;
alter table public.matura_exam_schedule add column if not exists created_at timestamptz not null default now();
alter table public.matura_exam_schedule add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_matura_exam_schedule_school on public.matura_exam_schedule(school_id);
create index if not exists idx_matura_exam_schedule_exam_at on public.matura_exam_schedule(exam_at);

alter table public.matura_exam_schedule enable row level security;

drop policy if exists "Matura schedule is readable" on public.matura_exam_schedule;
create policy "Matura schedule is readable"
on public.matura_exam_schedule
for select
using (true);

drop policy if exists "School admins can manage matura schedule" on public.matura_exam_schedule;
create policy "School admins can manage matura schedule"
on public.matura_exam_schedule
for all
to authenticated
using (true)
with check (true);

drop trigger if exists set_matura_exam_schedule_updated_at on public.matura_exam_schedule;
create trigger set_matura_exam_schedule_updated_at
before update on public.matura_exam_schedule
for each row
execute function public.update_updated_at_column();

create table if not exists public.matura_study_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  priority_index integer not null check (priority_index between 1 and 10),
  study_program_id uuid,
  name text not null,
  city text,
  institution text,
  requirements jsonb,
  is_currently_admitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matura_study_applications_student_priority_unique unique (student_id, priority_index),
  constraint matura_study_applications_student_program_unique unique (student_id, study_program_id)
);

alter table public.matura_study_applications drop constraint if exists matura_study_applications_student_id_fkey;
alter table public.matura_study_applications drop constraint if exists matura_study_applications_study_program_id_fkey;
alter table public.matura_study_applications add column if not exists student_id uuid;
alter table public.matura_study_applications add column if not exists priority_index integer;
alter table public.matura_study_applications add column if not exists study_program_id uuid;
alter table public.matura_study_applications add column if not exists name text;
alter table public.matura_study_applications add column if not exists city text;
alter table public.matura_study_applications add column if not exists institution text;
alter table public.matura_study_applications add column if not exists requirements jsonb;
alter table public.matura_study_applications add column if not exists is_currently_admitted boolean not null default false;
alter table public.matura_study_applications add column if not exists created_at timestamptz not null default now();
alter table public.matura_study_applications add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_matura_study_applications_student on public.matura_study_applications(student_id);
create index if not exists idx_matura_study_applications_program on public.matura_study_applications(study_program_id);

alter table public.matura_study_applications enable row level security;

drop policy if exists "Students can read own matura study applications" on public.matura_study_applications;
create policy "Students can read own matura study applications"
on public.matura_study_applications
for select
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_study_applications.student_id
      and up.auth_user_id = auth.uid()
  )
);

drop policy if exists "Students can manage own matura study applications" on public.matura_study_applications;
create policy "Students can manage own matura study applications"
on public.matura_study_applications
for all
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_study_applications.student_id
      and up.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_study_applications.student_id
      and up.auth_user_id = auth.uid()
  )
);

drop trigger if exists set_matura_study_applications_updated_at on public.matura_study_applications;
create trigger set_matura_study_applications_updated_at
before update on public.matura_study_applications
for each row
execute function public.update_updated_at_column();
