create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.matura_study_programs (
  id uuid primary key default gen_random_uuid(),
  school_id text,
  faculty text not null,
  component text,
  study_name text not null,
  city text not null,
  institution_type text not null,
  area text,
  field text,
  quota_type text not null default 'Bez posebne kvote',
  admission_round text not null default 'LJETNI',
  is_active boolean not null default true,
  citizen_quota integer not null default 0,
  foreign_quota integer not null default 0,
  school_gpa_weight numeric not null default 0,
  required_exams jsonb not null default '[]'::jsonb,
  elective_exams jsonb not null default '[]'::jsonb,
  special_achievements jsonb not null default '[]'::jsonb,
  health_considerations jsonb not null default '[]'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matura_study_programs drop constraint if exists matura_study_programs_school_id_fkey;
alter table public.matura_study_programs add column if not exists school_id text;
alter table public.matura_study_programs alter column school_id type text using school_id::text;
alter table public.matura_study_programs add column if not exists faculty text;
alter table public.matura_study_programs add column if not exists component text;
alter table public.matura_study_programs add column if not exists study_name text;
alter table public.matura_study_programs add column if not exists city text;
alter table public.matura_study_programs add column if not exists institution_type text;
alter table public.matura_study_programs add column if not exists area text;
alter table public.matura_study_programs add column if not exists field text;
alter table public.matura_study_programs add column if not exists quota_type text not null default 'Bez posebne kvote';
alter table public.matura_study_programs add column if not exists admission_round text not null default 'LJETNI';
alter table public.matura_study_programs add column if not exists is_active boolean not null default true;
alter table public.matura_study_programs add column if not exists citizen_quota integer not null default 0;
alter table public.matura_study_programs add column if not exists foreign_quota integer not null default 0;
alter table public.matura_study_programs add column if not exists school_gpa_weight numeric not null default 0;
alter table public.matura_study_programs add column if not exists required_exams jsonb not null default '[]'::jsonb;
alter table public.matura_study_programs add column if not exists elective_exams jsonb not null default '[]'::jsonb;
alter table public.matura_study_programs add column if not exists special_achievements jsonb not null default '[]'::jsonb;
alter table public.matura_study_programs add column if not exists health_considerations jsonb not null default '[]'::jsonb;
alter table public.matura_study_programs add column if not exists created_by uuid;
alter table public.matura_study_programs add column if not exists updated_by uuid;
alter table public.matura_study_programs add column if not exists created_at timestamptz not null default now();
alter table public.matura_study_programs add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_matura_study_programs_school on public.matura_study_programs(school_id);
create index if not exists idx_matura_study_programs_active on public.matura_study_programs(is_active);
create index if not exists idx_matura_study_programs_city on public.matura_study_programs(city);
create index if not exists idx_matura_study_programs_faculty on public.matura_study_programs(faculty);
create index if not exists idx_matura_study_programs_round on public.matura_study_programs(admission_round);

alter table public.matura_study_programs enable row level security;

drop policy if exists "Anyone can read active matura study programs" on public.matura_study_programs;
create policy "Anyone can read active matura study programs"
on public.matura_study_programs
for select
using (is_active = true);

drop policy if exists "Faculty admins can manage own matura study programs" on public.matura_study_programs;
create policy "Faculty admins can manage own matura study programs"
on public.matura_study_programs
for all
to authenticated
using (true)
with check (true);

drop trigger if exists set_matura_study_programs_updated_at on public.matura_study_programs;
create trigger set_matura_study_programs_updated_at
before update on public.matura_study_programs
for each row
execute function public.update_updated_at_column();
