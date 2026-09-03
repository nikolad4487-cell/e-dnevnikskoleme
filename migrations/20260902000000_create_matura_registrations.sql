create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.matura_registrations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.user_profiles(id) on delete cascade,
  class_id text references public.classes(id) on delete set null,
  school_id text references public.schools(id) on delete set null,
  subject_name text not null,
  level text not null check (level in ('A_RAZINA', 'B_RAZINA', 'JEDNA_RAZINA')),
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'CANCELED')),
  exam_location text,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matura_registrations_student_subject_unique unique (student_id, subject_name)
);

create index if not exists idx_matura_registrations_student on public.matura_registrations(student_id);
create index if not exists idx_matura_registrations_class on public.matura_registrations(class_id);
create index if not exists idx_matura_registrations_school on public.matura_registrations(school_id);
create index if not exists idx_matura_registrations_status on public.matura_registrations(status);

alter table public.matura_registrations enable row level security;

drop policy if exists "Students can read own matura registrations" on public.matura_registrations;
create policy "Students can read own matura registrations"
on public.matura_registrations
for select
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_registrations.student_id
      and up.auth_user_id = auth.uid()
  )
);

drop policy if exists "Students can insert own matura registrations" on public.matura_registrations;
create policy "Students can insert own matura registrations"
on public.matura_registrations
for insert
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_registrations.student_id
      and up.auth_user_id = auth.uid()
  )
);

drop policy if exists "Students can update own matura registrations" on public.matura_registrations;
create policy "Students can update own matura registrations"
on public.matura_registrations
for update
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_registrations.student_id
      and up.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = matura_registrations.student_id
      and up.auth_user_id = auth.uid()
  )
);

drop trigger if exists set_matura_registrations_updated_at on public.matura_registrations;
create trigger set_matura_registrations_updated_at
before update on public.matura_registrations
for each row
execute function public.update_updated_at_column();
