-- ============================================================
-- SCHOLARSHIP PORTAL - DATABASE SETUP (TEST VERSION)
-- Paste this whole file into Supabase > SQL Editor > Run.
-- It is safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Settings (one row). Applications close at closes_at.
--    To change the deadline later, run:
--    update public.app_settings set closes_at = '2027-06-30 23:59:00+01' where id = 1;
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  closes_at timestamptz not null default '2027-03-31 23:59:00+01'
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Administrators
-- ------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ------------------------------------------------------------
-- 3. Applications (one per applicant)
-- ------------------------------------------------------------
create sequence if not exists public.application_ref_seq start 1;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  email text default (auth.jwt() ->> 'email'),
  ref_no text unique,
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','info_required','approved','rejected','waitlisted')),
  full_name text,
  phone text,
  date_of_birth date,
  gender text,
  state text,
  lga text,
  address text,
  institution text,
  course text,
  department text,
  level text,
  matric_no text,
  academic_session text,
  cgpa text,
  reason text check (char_length(reason) <= 2000),
  declared boolean not null default false,
  declared_at timestamptz,
  submitted_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_status_idx on public.applications (status);
create index if not exists applications_submitted_idx on public.applications (submitted_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch
  before update on public.applications
  for each row execute function public.touch_updated_at();

-- True when the logged-in applicant may still change their application.
create or replace function public.can_edit()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.applications
    where user_id = auth.uid() and status in ('draft','info_required')
  );
$$;

-- ------------------------------------------------------------
-- 4. Documents (file details only; the files live in private storage)
-- ------------------------------------------------------------
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc_type text not null,
  file_path text not null,
  file_name text not null,
  file_size int,
  created_at timestamptz not null default now(),
  unique (user_id, doc_type)
);

-- ------------------------------------------------------------
-- 5. Audit log (written only by the admin function below)
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  application_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. Row level security: who can see / change what
-- ------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.admins enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.audit_log enable row level security;

-- settings: everybody can read the deadline
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
  for select using (true);

-- admins: you can only see your own row (the site uses this to check if you are an admin)
drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins
  for select to authenticated using (user_id = auth.uid());

-- applications
drop policy if exists app_select on public.applications;
create policy app_select on public.applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists app_insert on public.applications;
create policy app_insert on public.applications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists app_update on public.applications;
create policy app_update on public.applications
  for update to authenticated
  using (user_id = auth.uid() and status in ('draft','info_required'))
  with check (user_id = auth.uid() and status in ('draft','info_required'));

-- documents
drop policy if exists doc_select on public.application_documents;
create policy doc_select on public.application_documents
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists doc_insert on public.application_documents;
create policy doc_insert on public.application_documents
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_edit());

drop policy if exists doc_delete on public.application_documents;
create policy doc_delete on public.application_documents
  for delete to authenticated
  using (user_id = auth.uid() and public.can_edit());

-- audit log: admins can read
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 7. Column permissions: applicants can NEVER set their own
--    status, reference number or decision. Only the functions can.
-- ------------------------------------------------------------
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

revoke all on public.applications from anon, authenticated;
grant select on public.applications to authenticated;
grant insert (full_name, phone, date_of_birth, gender, state, lga, address, institution,
              course, department, level, matric_no, academic_session, cgpa, reason, declared)
  on public.applications to authenticated;
grant update (full_name, phone, date_of_birth, gender, state, lga, address, institution,
              course, department, level, matric_no, academic_session, cgpa, reason, declared)
  on public.applications to authenticated;

revoke all on public.application_documents from anon, authenticated;
grant select, delete on public.application_documents to authenticated;
grant insert (doc_type, file_path, file_name, file_size)
  on public.application_documents to authenticated;

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ------------------------------------------------------------
-- 8. Submit: validates everything and gives the reference number.
--    Safe to click twice: the same reference number is returned.
--    If you change the required documents, change the list below
--    AND the "documents" list in config.js.
-- ------------------------------------------------------------
create or replace function public.submit_application()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  a public.applications%rowtype;
  closes timestamptz;
  required_docs text[] := array['passport_photo','admission_letter','student_id','academic_result'];
  d text;
  new_ref text;
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;

  select * into a from public.applications where user_id = auth.uid() for update;
  if not found then
    raise exception 'Please fill in your application first.';
  end if;

  -- already submitted (or decided): return the same reference, change nothing
  if a.status not in ('draft','info_required') then
    return a.ref_no;
  end if;

  select closes_at into closes from public.app_settings where id = 1;
  if a.ref_no is null and now() > closes then
    raise exception 'Applications are closed.';
  end if;

  if coalesce(trim(a.full_name), '') = '' or coalesce(trim(a.phone), '') = ''
     or a.date_of_birth is null or coalesce(trim(a.state), '') = ''
     or coalesce(trim(a.institution), '') = '' or coalesce(trim(a.course), '') = ''
     or coalesce(trim(a.level), '') = '' or coalesce(trim(a.matric_no), '') = ''
     or coalesce(trim(a.reason), '') = '' then
    raise exception 'Please complete all required fields.';
  end if;

  if not a.declared then
    raise exception 'Please tick the declaration box.';
  end if;

  foreach d in array required_docs loop
    if not exists (
      select 1 from public.application_documents
      where user_id = auth.uid() and doc_type = d
    ) then
      raise exception 'A required document is missing: %', d;
    end if;
  end loop;

  new_ref := coalesce(
    a.ref_no,
    'SCH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.application_ref_seq')::text, 6, '0')
  );

  update public.applications
     set ref_no = new_ref,
         status = 'submitted',
         submitted_at = now(),
         declared_at = now()
   where id = a.id;

  return new_ref;
end;
$$;

-- ------------------------------------------------------------
-- 9. Admin decision function (checks you are an admin, writes audit log)
-- ------------------------------------------------------------
create or replace function public.admin_set_decision(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed.';
  end if;

  if p_status not in ('under_review','info_required','approved','rejected','waitlisted') then
    raise exception 'Invalid status.';
  end if;

  update public.applications
     set status = p_status,
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id and ref_no is not null;

  if not found then
    raise exception 'Application not found or not yet submitted.';
  end if;

  insert into public.audit_log (admin_id, action, application_id, detail)
  values (auth.uid(), 'set_' || p_status, p_id, p_note);
end;
$$;

-- Only logged-in users may call these functions
revoke all on function public.is_admin() from public, anon;
revoke all on function public.can_edit() from public, anon;
revoke all on function public.submit_application() from public, anon;
revoke all on function public.admin_set_decision(uuid, text, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_edit() to authenticated;
grant execute on function public.submit_application() to authenticated;
grant execute on function public.admin_set_decision(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 10. Private file storage (2 MB max, JPG / PNG / PDF only)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 2097152,
        array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

drop policy if exists docs_obj_select on storage.objects;
create policy docs_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists docs_obj_insert on storage.objects;
create policy docs_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_edit()
  );

drop policy if exists docs_obj_delete on storage.objects;
create policy docs_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_edit()
  );

-- ------------------------------------------------------------
-- 11. MAKE YOURSELF AN ADMIN
--     1) Create an account on the website first (Apply > Create account).
--     2) Put that same email below, remove the two dashes at the start
--        of the line, and run just this line.
-- ------------------------------------------------------------
-- insert into public.admins (user_id) select id from auth.users where email = 'YOUR-EMAIL@example.com' on conflict do nothing;
