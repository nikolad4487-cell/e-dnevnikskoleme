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

notify pgrst, 'reload schema';
