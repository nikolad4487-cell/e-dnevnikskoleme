with ranked as (
  select
    id,
    row_number() over (
      partition by class_id, subject_id, lower(trim(name))
      order by display_order nulls last, created_at nulls last, id
    ) as rn
  from public.grading_elements
  where class_id is not null
    and subject_id is not null
    and nullif(trim(name), '') is not null
)
delete from public.grading_elements ge
using ranked
where ge.id = ranked.id
  and ranked.rn > 1;

with template_matches as (
  select distinct on (ge.id)
    ge.id,
    t.display_order
  from public.grading_elements ge
  join public.subjects s on s.id = ge.subject_id
  join public.subject_grading_element_templates t
    on (t.school_id is null or t.school_id = ge.school_id)
   and lower(trim(t.subject_name)) = lower(trim(regexp_replace(s.name, '\s*\((izborni|praksa)\)\s*$', '', 'i')))
   and lower(trim(t.element_name)) = lower(trim(ge.name))
  where ge.class_id is not null
    and ge.subject_id is not null
  order by ge.id, t.school_id nulls last
)
update public.grading_elements ge
set display_order = template_matches.display_order
from template_matches
where ge.id = template_matches.id
  and ge.display_order is distinct from template_matches.display_order;

notify pgrst, 'reload schema';
