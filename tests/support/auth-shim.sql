-- Test-only stand-in for Supabase's auth and storage schemas and its roles, so Downtime's real SQL
-- runs on plain Postgres. Safe to run more than once.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text unique,
  email_confirmed_at timestamptz, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
-- Storage: buckets, objects (with row-level security, like Supabase), and its folder helper
create schema if not exists storage; grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets(id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now());
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid default auth.uid(), metadata jsonb, created_at timestamptz not null default now(), unique(bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
-- pg_cron stand-in (3-schedule.sql only needs schedule/unschedule to exist)
create schema if not exists cron;
create table if not exists cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean not null default true);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid = id returning true $$;
-- Supabase keeps authenticator apps (two-step sign-in) here; the stand-in fills it in
create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text, factor_type text not null default 'totp', status text not null default 'unverified', secret text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
