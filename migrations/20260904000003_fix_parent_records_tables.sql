create table if not exists public.parent_meetings (
    id uuid primary key default gen_random_uuid(),
    school_id text not null,
    class_id text not null,
    date date not null,
    time text not null,
    topic text not null,
    leader text not null,
    minutes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.parent_meetings drop constraint if exists parent_meetings_school_id_fkey;
alter table public.parent_meetings drop constraint if exists parent_meetings_class_id_fkey;
alter table public.parent_meetings add column if not exists school_id text;
alter table public.parent_meetings add column if not exists class_id text;
alter table public.parent_meetings add column if not exists date date;
alter table public.parent_meetings add column if not exists time text;
alter table public.parent_meetings add column if not exists topic text;
alter table public.parent_meetings add column if not exists leader text;
alter table public.parent_meetings add column if not exists minutes text;
alter table public.parent_meetings add column if not exists created_at timestamptz default now();
alter table public.parent_meetings add column if not exists updated_at timestamptz default now();
alter table public.parent_meetings alter column school_id type text using school_id::text;
alter table public.parent_meetings alter column class_id type text using class_id::text;

create table if not exists public.individual_discussions (
    id uuid primary key default gen_random_uuid(),
    school_id text not null,
    class_id text not null,
    student_id uuid not null references public.user_profiles(id) on delete cascade,
    parent_name text not null,
    counselor_id uuid references public.user_profiles(id) on delete set null,
    date date not null,
    notes text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.individual_discussions drop constraint if exists individual_discussions_school_id_fkey;
alter table public.individual_discussions drop constraint if exists individual_discussions_class_id_fkey;
alter table public.individual_discussions add column if not exists school_id text;
alter table public.individual_discussions add column if not exists class_id text;
alter table public.individual_discussions add column if not exists student_id uuid;
alter table public.individual_discussions add column if not exists parent_name text;
alter table public.individual_discussions add column if not exists counselor_id uuid;
alter table public.individual_discussions add column if not exists date date;
alter table public.individual_discussions add column if not exists notes text;
alter table public.individual_discussions add column if not exists created_at timestamptz default now();
alter table public.individual_discussions add column if not exists updated_at timestamptz default now();
alter table public.individual_discussions alter column school_id type text using school_id::text;
alter table public.individual_discussions alter column class_id type text using class_id::text;

create table if not exists public.parent_arrivals (
    id uuid primary key default gen_random_uuid(),
    school_id text not null,
    class_id text,
    student_id uuid not null references public.user_profiles(id) on delete cascade,
    parent_name text not null,
    date date not null,
    reason text not null,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.parent_arrivals drop constraint if exists parent_arrivals_school_id_fkey;
alter table public.parent_arrivals drop constraint if exists parent_arrivals_class_id_fkey;
alter table public.parent_arrivals add column if not exists school_id text;
alter table public.parent_arrivals add column if not exists class_id text;
alter table public.parent_arrivals add column if not exists student_id uuid;
alter table public.parent_arrivals add column if not exists parent_name text;
alter table public.parent_arrivals add column if not exists date date;
alter table public.parent_arrivals add column if not exists reason text;
alter table public.parent_arrivals add column if not exists notes text;
alter table public.parent_arrivals add column if not exists created_at timestamptz default now();
alter table public.parent_arrivals add column if not exists updated_at timestamptz default now();
alter table public.parent_arrivals alter column school_id type text using school_id::text;
alter table public.parent_arrivals alter column class_id type text using class_id::text;

create index if not exists idx_parent_meetings_school_class on public.parent_meetings(school_id, class_id);
create index if not exists idx_parent_meetings_date on public.parent_meetings(date);
create index if not exists idx_individual_discussions_school_class on public.individual_discussions(school_id, class_id);
create index if not exists idx_individual_discussions_student on public.individual_discussions(student_id);
create index if not exists idx_individual_discussions_date on public.individual_discussions(date);
create index if not exists idx_parent_arrivals_school_class on public.parent_arrivals(school_id, class_id);
create index if not exists idx_parent_arrivals_student on public.parent_arrivals(student_id);
create index if not exists idx_parent_arrivals_date on public.parent_arrivals(date);

alter table public.parent_meetings enable row level security;
alter table public.individual_discussions enable row level security;
alter table public.parent_arrivals enable row level security;

drop policy if exists "Authenticated manage parent_meetings" on public.parent_meetings;
create policy "Authenticated manage parent_meetings"
on public.parent_meetings for all to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated manage individual_discussions" on public.individual_discussions;
create policy "Authenticated manage individual_discussions"
on public.individual_discussions for all to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated manage parent_arrivals" on public.parent_arrivals;
create policy "Authenticated manage parent_arrivals"
on public.parent_arrivals for all to authenticated
using (true)
with check (true);
