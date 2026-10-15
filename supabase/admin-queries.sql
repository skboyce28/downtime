-- Downtime operator queries. Paste one at a time into Supabase > SQL Editor and press Run.
-- Queries marked CHANGES DATA change things; the rest only read.
-- The list with what each one is for is in docs/deployment.md#admin-queries.

-- 1) Which setup scripts have run, newest first
select script, version, applied_at from public.dt_schema_log order by applied_at desc;

-- 2) CHANGES DATA. Make an account the shop owner (they sign up in the app first)
select public.dt_make_owner('you@example.com');

-- 3) Who's on staff
select s.email, s.role, s.joined_at, p.name from public.dt_staff s left join public.dt_profiles p on p.user_id = s.user_id order by s.role, s.joined_at;

-- 4) CHANGES DATA. Take someone off staff (owners included; use with care)
delete from public.dt_staff where email = 'someone@example.com';

-- 5) Live listings, soonest-ending auctions first
select title, kind, status, price_cents, high_cents, bid_count, quantity, ends_at
from public.dt_listings where status = 'live' order by kind, ends_at nulls last;

-- 6) Every bid on one listing, newest first (shows real bidder emails)
select b.amount_cents, b.at, u.email
from public.dt_bids b left join auth.users u on u.id = b.user_id
where b.listing_id = (select id from public.dt_listings where title = 'Listing title here' order by created_at desc limit 1)
order by b.at desc;

-- 7) Sales waiting for payment, oldest first
select at, title, qty, amount_cents, buyer_name, buyer_email, how from public.dt_sales where status = 'awaiting payment' order by at;

-- 8) Sales by month (cancelled sales left out)
select date_trunc('month', at at time zone (select tz from public.dt_shop)) as month, count(*) as sales, sum(qty) as items,
       sum(amount_cents) / 100.0 as revenue, sum(amount_cents - cost_cents) filter (where cost_cents is not null) / 100.0 as profit_where_cost_known
from public.dt_sales where status <> 'cancelled' group by 1 order by 1 desc;

-- 9) CHANGES DATA. Close any auctions that are past their end time right now
--    (normally automatic: when anyone opens the store, and every minute with 3-schedule.sql)
select public.dt_close_due();

-- 10) Is the every-minute auction closer scheduled? (needs 3-schedule.sql and pg_cron)
select jobname, schedule, active from cron.job where jobname = 'downtime-close-auctions';

-- 11) CHANGES DATA. Extend one auction by a day (for example after an outage). Bidders aren't notified.
update public.dt_listings set ends_at = ends_at + interval '1 day', updated_at = now()
where status = 'live' and kind = 'auction' and title = 'Listing title here';

-- 12) Accounts that signed up but never confirmed their email
select email, created_at from auth.users where email_confirmed_at is null order by created_at desc;

-- 13) Photo storage used, in MB
select count(*) as photos, round(sum((metadata->>'size')::bigint) / 1048576.0, 1) as mb from storage.objects where bucket_id = 'listing-photos';

-- 14) Orders waiting for payment, one row per order, with what's in it
select min(at) as at, max(buyer_name) as buyer, max(buyer_email) as email, sum(amount_cents) / 100.0 as total,
       string_agg(title || case when variant <> '' then ' (' || variant || ')' else '' end || case when qty > 1 then ' x' || qty else '' end, ', ') as items
from public.dt_sales where status = 'awaiting payment'
group by coalesce(order_id, id) order by min(at);

-- 15) CHANGES DATA. Reset someone's two-step sign-in (they lost the phone with their authenticator app).
--     They sign in with their password and set up a new app.
delete from auth.mfa_factors where user_id = (select id from auth.users where lower(email) = lower('them@example.com'));
