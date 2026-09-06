alter table public.grading_elements add column if not exists school_id text;
alter table public.grading_elements add column if not exists teacher_id uuid;
alter table public.grading_elements add column if not exists description text;

create table if not exists public.subject_grading_element_templates (
  id uuid primary key default gen_random_uuid(),
  school_id text null,
  subject_name text not null,
  element_name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subject_grading_element_templates_unique
on public.subject_grading_element_templates (coalesce(school_id, ''), lower(subject_name), lower(element_name));

alter table public.subject_grading_element_templates enable row level security;

drop policy if exists "Authenticated manage subject grading element templates" on public.subject_grading_element_templates;
create policy "Authenticated manage subject grading element templates"
on public.subject_grading_element_templates
for all
to authenticated
using (true)
with check (true);

with templates(subject_name, element_name, display_order) as (
  values
    ('biologija s higijenom i ekologijom', 'usvojenost nastavnih sadržaja', 0),
    ('biologija s higijenom i ekologijom', 'primjena nastavnih sadržaja', 1),
    ('biologija s higijenom i ekologijom', 'samostalni rad', 2),
    ('engleski jezik i', 'čitanje i slušanje s razumijevanjem', 0),
    ('engleski jezik i', 'govorenje', 1),
    ('engleski jezik i', 'pisanje', 2),
    ('engleski jezik i', 'jezično posredovanje', 3),
    ('etika', 'moralno i etičko djelovanje', 0),
    ('etika', 'moralno i etičko promišljanje', 1),
    ('francuski jezik ii', 'čitanje i slušanje s razumijevanjem', 0),
    ('francuski jezik ii', 'govorenje', 1),
    ('francuski jezik ii', 'pisanje', 2),
    ('francuski jezik ii', 'jezično posredovanje', 3),
    ('gospodarska matematika', 'usvojenost znanja i vještina', 0),
    ('gospodarska matematika', 'rješavanje problema', 1),
    ('gospodarsko pravo', 'usvojenost nastavnih sadržaja', 0),
    ('gospodarsko pravo', 'primjena nastavnih sadržaja', 1),
    ('gospodarsko pravo', 'samostalni rad', 2),
    ('hrvatski jezik', 'jezik', 0),
    ('hrvatski jezik', 'književnost', 1),
    ('hrvatski jezik', 'pisano izražavanje', 2),
    ('hrvatski jezik', 'usmeno izražavanje', 3),
    ('hrvatski jezik', 'lektira', 4),
    ('knjigovodstvo', 'usvojenost nastavnih sadržaja', 0),
    ('knjigovodstvo', 'primjena nastavnih sadržaja', 1),
    ('knjigovodstvo', 'samostalni rad', 2),
    ('kuharstvo', 'usmeno', 0),
    ('kuharstvo', 'vježbe', 1),
    ('kuharstvo', 'higijena', 2),
    ('kuharstvo', 'samostalni rad', 3),
    ('kuharstvo (sa slastičarstvom)', 'usmeno', 0),
    ('kuharstvo (sa slastičarstvom)', 'vježbe', 1),
    ('kuharstvo (sa slastičarstvom)', 'higijena', 2),
    ('kuharstvo (sa slastičarstvom)', 'samostalni rad', 3),
    ('marketing u turizmu', 'usvojenost nastavnih sadržaja', 0),
    ('marketing u turizmu', 'primjena nastavnih sadržaja', 1),
    ('marketing u turizmu', 'samostalni rad', 2),
    ('njemački jezik i', 'čitanje i slušanje s razumijevanjem', 0),
    ('njemački jezik i', 'govorenje', 1),
    ('njemački jezik i', 'pisanje', 2),
    ('njemački jezik i', 'jezično posredovanje', 3),
    ('njemački jezik ii', 'čitanje i slušanje s razumijevanjem', 0),
    ('njemački jezik ii', 'govorenje', 1),
    ('njemački jezik ii', 'pisanje', 2),
    ('njemački jezik ii', 'jezično posredovanje', 3),
    ('organizacija poslovanja ugostiteljskih poduzeća', 'usvojenost nastavnih sadržaja', 0),
    ('organizacija poslovanja ugostiteljskih poduzeća', 'primjena nastavnih sadržaja', 1),
    ('organizacija poslovanja ugostiteljskih poduzeća', 'samostalni rad', 2),
    ('osnove turizma', 'usvojenost nastavnih sadržaja', 0),
    ('osnove turizma', 'primjena nastavnih sadržaja', 1),
    ('osnove turizma', 'samostalni rad', 2),
    ('politika i gospodarstvo', 'usvojenost nastavnih sadržaja', 0),
    ('politika i gospodarstvo', 'primjena nastavnih sadržaja', 1),
    ('politika i gospodarstvo', 'samostalni rad', 2),
    ('poslovna psihologija s komunikacijom', 'usvojenost nastavnih sadržaja', 0),
    ('poslovna psihologija s komunikacijom', 'primjena nastavnih sadržaja', 1),
    ('poslovna psihologija s komunikacijom', 'samostalni rad', 2),
    ('poslovno dopisivanje', 'usvojenost nastavnih sadržaja', 0),
    ('poslovno dopisivanje', 'primjena nastavnih sadržaja', 1),
    ('poslovno dopisivanje', 'samostalni rad', 2),
    ('povijest', 'činjenično znanje', 0),
    ('povijest', 'uzročno-posljedično zaključivanje', 1),
    ('povijest', 'snalaženje u vremenu i prostoru', 2),
    ('povijest hrvatske kulturne baštine', 'usvojenost nastavnih sadržaja - usmeno', 0),
    ('povijest hrvatske kulturne baštine', 'usvojenost nastavnih sadržaja - pisano', 1),
    ('povijest hrvatske kulturne baštine', 'aktivnost i kreativnost', 2),
    ('poznavanje robe i prehrana', 'usvojenost nastavnih sadržaja', 0),
    ('poznavanje robe i prehrana', 'primjena nastavnih sadržaja', 1),
    ('poznavanje robe i prehrana', 'samostalni rad', 2),
    ('praktična nastava', 'stručni rad', 0),
    ('praktična nastava', 'radna higijena', 1),
    ('praktična nastava', 'radna disciplina', 2),
    ('praktična nastava', 'dnevnik rada', 3),
    ('praktična nastava', 'dokumentacija praktične nastave', 4),
    ('promet i putničke agencije', 'usvojenost nastavnih sadržaja', 0),
    ('promet i putničke agencije', 'primjena nastavnih sadržaja', 1),
    ('promet i putničke agencije', 'samostalni rad', 2),
    ('računalstvo', 'usvojenost nastavnih sadržaja', 0),
    ('računalstvo', 'primjena nastavnih sadržaja', 1),
    ('računalstvo', 'samostalni rad', 2),
    ('računovodstvo i kontrola', 'usvojenost nastavnih sadržaja', 0),
    ('računovodstvo i kontrola', 'primjena nastavnih sadržaja', 1),
    ('računovodstvo i kontrola', 'samostalni rad', 2),
    ('recepcijsko poslovanje', 'usvojenost nastavnih sadržaja', 0),
    ('recepcijsko poslovanje', 'primjena nastavnih sadržaja', 1),
    ('recepcijsko poslovanje', 'samostalni rad', 2),
    ('slastičarstvo', 'usmeno', 0),
    ('slastičarstvo', 'vježbe', 1),
    ('slastičarstvo', 'higijena', 2),
    ('slastičarstvo', 'samostalni rad', 3),
    ('statistika', 'usvojenost nastavnih sadržaja', 0),
    ('statistika', 'primjena nastavnih sadržaja', 1),
    ('statistika', 'samostalni rad', 2),
    ('talijanski jezik ii', 'čitanje i slušanje s razumijevanjem', 0),
    ('talijanski jezik ii', 'govorenje', 1),
    ('talijanski jezik ii', 'pisanje', 2),
    ('talijanski jezik ii', 'jezično posredovanje', 3),
    ('tjelesna i zdravstvena kultura', 'motorička znanja', 0),
    ('tjelesna i zdravstvena kultura', 'motorička postignuća i sposobnosti', 1),
    ('tjelesna i zdravstvena kultura', 'zdravstveni i odgojni učinci tjelesne aktivnosti', 2),
    ('turistički zemljopis', 'geografska znanja', 0),
    ('turistički zemljopis', 'geografske vještine', 1),
    ('turistički zemljopis', 'kartografska pismenost', 2),
    ('ugostiteljsko posluživanje', 'usmeno', 0),
    ('ugostiteljsko posluživanje', 'vježbe', 1),
    ('ugostiteljsko posluživanje', 'higijena', 2),
    ('ugostiteljsko posluživanje', 'samostalni rad', 3),
    ('vjeronauk', 'znanje', 0),
    ('vjeronauk', 'stvaralačko izražavanje', 1),
    ('vjeronauk', 'kultura međusobnog komuniciranja', 2)
)
insert into public.subject_grading_element_templates (school_id, subject_name, element_name, display_order)
select null, subject_name, element_name, display_order
from templates t
where not exists (
  select 1
  from public.subject_grading_element_templates existing
  where existing.school_id is null
    and lower(existing.subject_name) = lower(t.subject_name)
    and lower(existing.element_name) = lower(t.element_name)
);

with templates(subject_name, element_name, display_order) as (
  select subject_name, element_name, display_order
  from public.subject_grading_element_templates
  where school_id is null
)
insert into public.grading_elements (school_id, class_id, subject_id, teacher_id, name, display_order)
select distinct on (cst.class_id, cst.subject_id, cst.teacher_id, t.element_name)
  coalesce(cst.school_id, cs.school_id),
  cst.class_id,
  cst.subject_id,
  cst.teacher_id,
  t.element_name,
  t.display_order
from public.class_subject_teachers cst
join public.subjects s on s.id = cst.subject_id
left join public.class_subjects cs on cs.class_id = cst.class_id and cs.subject_id = cst.subject_id
join templates t on lower(t.subject_name) = lower(trim(regexp_replace(s.name, '\s*\((izborni|praksa)\)\s*$', '', 'i')))
where lower(trim(regexp_replace(s.name, '\s*\((izborni|praksa)\)\s*$', '', 'i'))) <> 'sat razrednika'
  and not exists (
    select 1
    from public.grading_elements ge
    where ge.class_id = cst.class_id
      and ge.subject_id = cst.subject_id
      and lower(ge.name) = lower(t.element_name)
  )
order by cst.class_id, cst.subject_id, cst.teacher_id, t.element_name, t.display_order
on conflict do nothing;

notify pgrst, 'reload schema';
