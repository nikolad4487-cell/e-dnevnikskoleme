with desired(element_name, display_order) as (
  values
    ('stručni rad', 0),
    ('radna higijena', 1),
    ('radna disciplina', 2),
    ('dnevnik rada', 3),
    ('dokumentacija praktične nastave', 4)
)
insert into public.subject_grading_element_templates (school_id, subject_name, element_name, display_order)
select null, 'praktična nastava', d.element_name, d.display_order
from desired d
where not exists (
  select 1
  from public.subject_grading_element_templates existing
  where existing.school_id is null
    and lower(existing.subject_name) = 'praktična nastava'
    and lower(existing.element_name) = lower(d.element_name)
);

with desired(element_name, display_order) as (
  values
    ('stručni rad', 0),
    ('radna higijena', 1),
    ('radna disciplina', 2),
    ('dnevnik rada', 3),
    ('dokumentacija praktične nastave', 4)
),
practice_subjects as (
  select id
  from public.subjects
  where lower(trim(regexp_replace(name, '\s*\((izborni|praksa)\)\s*$', '', 'i'))) = 'praktična nastava'
     or lower(name) like '%praksa%'
),
ranked as (
  select
    ge.id,
    d.element_name,
    d.display_order,
    row_number() over (
      partition by ge.class_id, ge.subject_id, lower(trim(ge.name))
      order by ge.display_order nulls last, ge.created_at nulls last, ge.id
    ) as rn
  from public.grading_elements ge
  join practice_subjects ps on ps.id = ge.subject_id
  join desired d on lower(trim(ge.name)) = lower(d.element_name)
),
updated as (
  update public.grading_elements ge
  set name = ranked.element_name,
      display_order = ranked.display_order
  from ranked
  where ge.id = ranked.id
    and ranked.rn = 1
  returning ge.id
)
delete from public.grading_elements ge
using ranked
where ge.id = ranked.id
  and ranked.rn > 1;

with desired(element_name, display_order) as (
  values
    ('stručni rad', 0),
    ('radna higijena', 1),
    ('radna disciplina', 2),
    ('dnevnik rada', 3),
    ('dokumentacija praktične nastave', 4)
),
practice_subjects as (
  select id
  from public.subjects
  where lower(trim(regexp_replace(name, '\s*\((izborni|praksa)\)\s*$', '', 'i'))) = 'praktična nastava'
     or lower(name) like '%praksa%'
),
pairs as (
  select distinct cs.school_id, cs.class_id, cs.subject_id
  from public.class_subjects cs
  join practice_subjects ps on ps.id = cs.subject_id
  union
  select distinct cst.school_id, cst.class_id, cst.subject_id
  from public.class_subject_teachers cst
  join practice_subjects ps on ps.id = cst.subject_id
  union
  select distinct ge.school_id, ge.class_id, ge.subject_id
  from public.grading_elements ge
  join practice_subjects ps on ps.id = ge.subject_id
),
representative_teacher as (
  select distinct on (class_id, subject_id)
    class_id,
    subject_id,
    teacher_id
  from public.class_subject_teachers
  where subject_id in (select id from practice_subjects)
  order by class_id, subject_id, teacher_id
),
representative_existing as (
  select distinct on (class_id, subject_id)
    class_id,
    subject_id,
    teacher_id
  from public.grading_elements
  where subject_id in (select id from practice_subjects)
    and teacher_id is not null
  order by class_id, subject_id, display_order nulls last, created_at nulls last
)
insert into public.grading_elements (school_id, class_id, subject_id, teacher_id, name, display_order)
select
  p.school_id,
  p.class_id,
  p.subject_id,
  coalesce(rt.teacher_id, re.teacher_id),
  d.element_name,
  d.display_order
from pairs p
cross join desired d
left join representative_teacher rt on rt.class_id = p.class_id and rt.subject_id = p.subject_id
left join representative_existing re on re.class_id = p.class_id and re.subject_id = p.subject_id
where not exists (
  select 1
  from public.grading_elements ge
  where ge.class_id = p.class_id
    and ge.subject_id = p.subject_id
    and lower(trim(ge.name)) = lower(d.element_name)
);

notify pgrst, 'reload schema';
