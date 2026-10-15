-- Downtime, step 3 (optional, recommended): close auctions right on time.
-- Without this, an auction closes the next time anyone opens the store or the listing, which is
-- correct but can be late, so the winner's and staff's notices wait until then.
-- First turn on the pg_cron extension: Supabase > Database > Extensions > search "pg_cron" > enable.
-- Then paste this into the SQL Editor and press Run. Safe to run more than once.

select cron.unschedule(jobid) from cron.job where jobname = 'downtime-close-auctions';
select cron.schedule('downtime-close-auctions', '* * * * *', $$select public.dt_close_due()$$);

insert into public.dt_schema_log (script, version) values ('3-schedule.sql', '0.1');
