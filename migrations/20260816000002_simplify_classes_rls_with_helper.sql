create or replace function public.can_manage_classes_for_school(target_school_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = target_school_id
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  );
$$;

grant execute on function public.can_manage_classes_for_school(text) to authenticated;

drop policy if exists "Authenticated manage classes" on public.classes;
drop policy if exists "Admins can read classes" on public.classes;
drop policy if exists "Admins can insert classes" on public.classes;
drop policy if exists "Admins can update classes" on public.classes;
drop policy if exists "Admins can delete classes" on public.classes;

create policy "Admins can read classes"
on public.classes
for select
to authenticated
using (
  public.can_manage_classes_for_school(classes.school_id::text)
);

create policy "Admins can insert classes"
on public.classes
for insert
to authenticated
with check (
  school_id is not null
  and public.can_manage_classes_for_school(classes.school_id::text)
);

create policy "Admins can update classes"
on public.classes
for update
to authenticated
using (
  public.can_manage_classes_for_school(classes.school_id::text)
)
with check (
  school_id is not null
  and public.can_manage_classes_for_school(classes.school_id::text)
);

create policy "Admins can delete classes"
on public.classes
for delete
to authenticated
using (
  public.can_manage_classes_for_school(classes.school_id::text)
);

notify pgrst, 'reload schema';
