-- Downtime, step 1: the shop, listings, bids, sales, notices, and every action the app can take.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.
-- Then run 2-photos.sql (listing photos), and optionally 3-schedule.sql (closes auctions on time).
--
-- How access works: every table has row-level security turned on and NO policies, so nobody can
-- read or change a table directly. The app only calls the functions below. Each one runs with the
-- database's own rights ("security definer") and checks who is asking before it does anything:
--   - anyone, signed in or not: browse the storefront and look at a listing
--   - signed-in buyers: bid, buy, see their own bids, purchases and notices
--   - shop staff (owner and sellers): list items, log sales, see the dashboard
--   - the owner: shop settings, the staff share key, removing staff
-- Money is stored in cents (whole numbers), so $12.50 is 1250.
-- v0.2 added sizes and colors (listing options), the cart (orders), and sold-out items staying on show.

-- 0) Share keys look like K7QM-4XPD (no 0/O/1/I/L to avoid mix-ups)
create or replace function public.dt_gen_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random()*31)::int, 1), '') from generate_series(1,8)
$$;
create or replace function public.dt_fmt_code(c text) returns text
language sql immutable as $$
  select substr(x,1,4) || '-' || substr(x,5,4) from (select upper(regexp_replace(coalesce(c,''), '[^A-Za-z0-9]', '', 'g')) x) t
$$;

-- 1) Tables
-- The shop itself: one row
create table if not exists public.dt_shop (
  id             int primary key default 1 check (id = 1),
  name           text not null default 'Downtime',
  tagline        text not null default 'goods by SB.co',
  about          text not null default '',
  payment_note   text not null default 'We''ll message you to arrange payment and pickup or shipping.',
  contact_email  text,
  join_code      text not null default public.dt_fmt_code(public.dt_gen_code()),
  low_stock      int  not null default 2 check (low_stock between 0 and 100),
  extend_minutes int  not null default 2 check (extend_minutes between 1 and 30),
  tz             text not null default 'America/New_York',
  updated_at     timestamptz not null default now()
);
insert into public.dt_shop (id) values (1) on conflict (id) do nothing;

-- Shop staff: the owner (added once in the SQL Editor) and sellers (join with the share key)
create table if not exists public.dt_staff (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  role      text not null default 'seller' check (role in ('owner','seller')),
  joined_at timestamptz not null default now()
);

-- Everyone who signs in gets a display name (shown masked next to bids, like "J•••n")
create table if not exists public.dt_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '' check (length(name) <= 40),
  created_at timestamptz not null default now()
);

-- Listings: fixed price (with stock) or auctions (with optional reserve and Buy It Now)
create table if not exists public.dt_listings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 120),
  description   text not null default '' check (length(description) <= 5000),
  line          text not null default 'custom' check (line in ('custom','one-off','resale')),
  category      text not null default '' check (length(category) <= 40),
  kind          text not null default 'fixed' check (kind in ('fixed','auction')),
  price_cents   int  check (price_cents   is null or price_cents   between 1 and 10000000),
  start_cents   int  check (start_cents   is null or start_cents   between 1 and 10000000),
  reserve_cents int  check (reserve_cents is null or reserve_cents between 1 and 10000000),
  buy_now_cents int  check (buy_now_cents is null or buy_now_cents between 1 and 10000000),
  cost_cents    int  check (cost_cents    is null or cost_cents    between 0 and 10000000),
  quantity      int  not null default 1 check (quantity between 0 and 10000),
  ends_at       timestamptz,
  status        text not null default 'draft' check (status in ('draft','live','sold','unsold','withdrawn')),
  photos        jsonb not null default '[]'::jsonb,
  high_cents    int,
  high_user     uuid references auth.users(id) on delete set null,
  bid_count     int  not null default 0,
  winner        uuid references auth.users(id) on delete set null,
  final_cents   int,
  closed_at     timestamptz,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index if not exists dt_listings_status on public.dt_listings (status, ends_at);

create table if not exists public.dt_bids (
  id           bigserial primary key,
  listing_id   uuid not null references public.dt_listings(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  amount_cents int  not null,
  at           timestamptz not null default now()
);
create index if not exists dt_bids_listing on public.dt_bids (listing_id, at desc);
create index if not exists dt_bids_user on public.dt_bids (user_id, at desc);

-- Sales: online (bought, Buy It Now, won at auction) and logged by staff (events, in person)
create table if not exists public.dt_sales (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid references public.dt_listings(id) on delete set null,
  title        text not null,
  qty          int  not null default 1 check (qty between 1 and 10000),
  amount_cents int  not null check (amount_cents between 0 and 100000000),
  cost_cents   int,
  channel      text not null default 'online' check (channel in ('online','in person','event','other')),
  event        text not null default '' check (length(event) <= 80),
  how          text not null default 'manual' check (how in ('buy','buy now','auction','manual')),
  buyer_id     uuid references auth.users(id) on delete set null,
  buyer_name   text not null default '',
  buyer_email  text not null default '',
  seller_id    uuid references auth.users(id) on delete set null,
  status       text not null default 'awaiting payment' check (status in ('awaiting payment','paid','complete','cancelled')),
  note         text not null default '' check (length(note) <= 500),
  at           timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists dt_sales_at on public.dt_sales (at);
create index if not exists dt_sales_buyer on public.dt_sales (buyer_id);

-- v0.2: sizes and colors. A fixed-price listing can have options, each with its own stock:
--   [{"id":"m-black","size":"M","color":"Black","qty":3}, ...]; its quantity is then their total.
alter table public.dt_listings add column if not exists variants jsonb not null default '[]'::jsonb;
-- v0.2: a cart checkout is one order with a sale per line; sales remember which option sold
alter table public.dt_sales add column if not exists order_id uuid;
alter table public.dt_sales add column if not exists variant_id text not null default '';
alter table public.dt_sales add column if not exists variant text not null default '';
create index if not exists dt_sales_order on public.dt_sales (order_id);

-- In-app notices (outbid, won, sold, ...)
create table if not exists public.dt_notices (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  listing_id uuid references public.dt_listings(id) on delete set null,
  title      text not null,
  body       text not null default '',
  at         timestamptz not null default now(),
  read       boolean not null default false
);
create index if not exists dt_notices_user on public.dt_notices (user_id, at desc);

-- Wrong share keys, so nobody can guess the staff key by trying thousands of them
create table if not exists public.dt_join_tries (user_id uuid not null, at timestamptz not null default now());

-- Which scripts have run (shown by the admin queries)
create table if not exists public.dt_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());

-- Row-level security on, no policies: tables are reachable only through the functions below
alter table public.dt_shop       enable row level security;
alter table public.dt_staff      enable row level security;
alter table public.dt_profiles   enable row level security;
alter table public.dt_listings   enable row level security;
alter table public.dt_bids       enable row level security;
alter table public.dt_sales      enable row level security;
alter table public.dt_notices    enable row level security;
alter table public.dt_join_tries enable row level security;
alter table public.dt_schema_log enable row level security;

-- 2) Helpers
create or replace function public.dt_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dt_staff where user_id = auth.uid())
$$;
create or replace function public.dt_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dt_staff where user_id = auth.uid() and role = 'owner')
$$;

-- The smallest raise over the current high bid
create or replace function public.dt_increment(c int) returns int
language sql immutable as $$
  select case when c < 2500 then 100 when c < 10000 then 200 when c < 25000 then 500
              when c < 100000 then 1000 else 2500 end
$$;

-- "Jordan" -> "J•••n": enough to recognise yourself, not enough to identify anyone else
create or replace function public.dt_mask(n text) returns text
language sql immutable as $$
  select case when coalesce(trim(n),'') = '' then 'Bidder'
              when length(trim(n)) <= 2 then left(trim(n),1) || '•••'
              else left(trim(n),1) || '•••' || right(trim(n),1) end
$$;

create or replace function public.dt_name_of(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select name from dt_profiles where user_id = u), ''),
                  split_part((select email from auth.users where id = u), '@', 1), '')
$$;

create or replace function public.dt_money(c int) returns text
language sql immutable as $$ select '$' || to_char(c / 100.0, 'FM999,999,990.00') $$;

create or replace function public.dt_notify(p_user uuid, p_kind text, p_listing uuid, p_title text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into dt_notices (user_id, kind, listing_id, title, body)
  select p_user, p_kind, p_listing, p_title, coalesce(p_body,'') where p_user is not null
$$;
create or replace function public.dt_notify_staff(p_kind text, p_listing uuid, p_title text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into dt_notices (user_id, kind, listing_id, title, body)
  select user_id, p_kind, p_listing, p_title, coalesce(p_body,'') from dt_staff
$$;

-- Can someone still use Buy It Now on this auction? Only until the first bid.
create or replace function public.dt_buy_now_open(l public.dt_listings) returns boolean
language sql stable as $$
  select l.kind = 'auction' and l.status = 'live' and l.buy_now_cents is not null and l.bid_count = 0 and l.ends_at > now()
$$;

-- "M / Black", "M", or "Black"
create or replace function public.dt_variant_label(v jsonb) returns text
language sql immutable as $$
  select concat_ws(' / ', nullif(trim(coalesce(v->>'size','')), ''), nullif(trim(coalesce(v->>'color','')), ''))
$$;

-- Clean up options sent by the app: trims names, gives each a stable id from its size and color,
-- and refuses duplicates, blanks, and silly counts.
create or replace function public.dt_clean_variants(p jsonb) returns jsonb
language plpgsql immutable as $$
declare v jsonb; out jsonb := '[]'::jsonb; sz text; co text; q int; vid text; ids text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'::jsonb; end if;
  if jsonb_array_length(p) > 60 then raise exception 'Up to 60 size and color options.'; end if;
  for v in select * from jsonb_array_elements(p) loop
    sz := left(trim(coalesce(v->>'size','')), 20); co := left(trim(coalesce(v->>'color','')), 20);
    if sz = '' and co = '' then raise exception 'Each option needs a size or a color.'; end if;
    q := coalesce(nullif(v->>'qty','')::int, 0);
    if q < 0 or q > 10000 then raise exception 'Stock for % has to be 0 to 10,000.', concat_ws(' / ', nullif(sz,''), nullif(co,'')); end if;
    vid := trim(both '-' from lower(regexp_replace(sz || '-' || co, '[^A-Za-z0-9]+', '-', 'g')));
    if vid = '' then vid := md5(sz || '|' || co); end if;
    if vid = any(ids) then raise exception '% is listed twice.', concat_ws(' / ', nullif(sz,''), nullif(co,'')); end if;
    ids := ids || vid;
    out := out || jsonb_build_array(jsonb_build_object('id', vid, 'size', sz, 'color', co, 'qty', q));
  end loop;
  return out;
end $$;

-- Take stock off a fixed-price listing (an option's stock when it has options). The caller has
-- already locked the listing row. Marks it sold when nothing is left. Returns the option's label.
create or replace function public.dt_take_stock(p_id uuid, p_variant text, p_qty int) returns text
language plpgsql security definer set search_path = public as $$
declare l dt_listings; v jsonb; i int; label text := ''; left_ int;
begin
  select * into l from dt_listings where id = p_id;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity has to be at least 1.'; end if;
  if jsonb_array_length(l.variants) > 0 then
    select x.value, x.ordinality - 1 into v, i from jsonb_array_elements(l.variants) with ordinality x where x.value->>'id' = p_variant;
    if v is null then raise exception 'Pick a size or color for %.', l.title; end if;
    label := dt_variant_label(v);
    if (v->>'qty')::int < p_qty then
      raise exception '%', case when (v->>'qty')::int = 0 then l.title || ' (' || label || ') is sold out.'
                              else 'Only ' || (v->>'qty') || ' left of ' || l.title || ' (' || label || ').' end;
    end if;
    l.variants := jsonb_set(l.variants, array[i::text, 'qty'], to_jsonb((v->>'qty')::int - p_qty));
    left_ := (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(l.variants) x);
  else
    if l.quantity < p_qty then
      raise exception '%', case when l.quantity = 0 then l.title || ' is sold out.' else 'Only ' || l.quantity || ' left of ' || l.title || '.' end;
    end if;
    left_ := l.quantity - p_qty;
  end if;
  update dt_listings set variants = l.variants, quantity = left_,
         status = case when left_ = 0 and status = 'live' then 'sold' else status end,
         closed_at = case when left_ = 0 then now() else null end,
         final_cents = case when left_ = 0 then l.price_cents end, updated_at = now()
   where id = p_id;
  return label;
end $$;

-- Put stock back (a cancelled sale). Back on sale if it had sold out.
create or replace function public.dt_put_back(p_id uuid, p_variant text, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare l dt_listings; i int;
begin
  select * into l from dt_listings where id = p_id for update;
  if not found or l.kind <> 'fixed' then return; end if;
  if jsonb_array_length(l.variants) > 0 and coalesce(p_variant,'') <> '' then
    select x.ordinality - 1 into i from jsonb_array_elements(l.variants) with ordinality x where x.value->>'id' = p_variant;
    if i is not null then
      l.variants := jsonb_set(l.variants, array[i::text, 'qty'], to_jsonb((l.variants->i->>'qty')::int + p_qty));
    end if;
  end if;
  update dt_listings set variants = l.variants, quantity = quantity + p_qty,
         status = case when status = 'sold' then 'live' else status end, closed_at = null, final_cents = null, updated_at = now()
   where id = p_id;
end $$;

-- One listing as JSON. The public view never includes the reserve amount, cost, or who is bidding
-- (bidders show masked). Staff also see reserve, cost, and the high bidder's and winner's details.
create or replace function public.dt_view(p_id uuid, p_full boolean default false) returns json
language plpgsql stable security definer set search_path = public as $$
declare l dt_listings; uid uuid := auth.uid(); j jsonb;
begin
  select * into l from dt_listings where id = p_id;
  if not found then return null; end if;
  j := jsonb_build_object(
    'id', l.id, 'title', l.title, 'description', l.description, 'line', l.line, 'category', l.category,
    'kind', l.kind, 'status', l.status, 'photos', l.photos, 'quantity', l.quantity, 'variants', l.variants,
    'price_cents', l.price_cents, 'start_cents', l.start_cents, 'ends_at', l.ends_at,
    'buy_now_cents', case when dt_buy_now_open(l) or p_full then l.buy_now_cents end,
    'buy_now_open', dt_buy_now_open(l),
    'high_cents', l.high_cents, 'bid_count', l.bid_count,
    'min_next', case when l.kind <> 'auction' then null when l.bid_count = 0 then l.start_cents else l.high_cents + dt_increment(l.high_cents) end,
    'has_reserve', l.reserve_cents is not null,
    'reserve_met', l.reserve_cents is null or coalesce(l.high_cents,0) >= l.reserve_cents,
    'final_cents', case when l.status = 'sold' then l.final_cents end,
    'closed_at', l.closed_at, 'published_at', l.published_at,
    'you_high', coalesce(l.high_user = uid, false),
    'you_won', coalesce(l.winner = uid, false),
    'you_bid', uid is not null and exists (select 1 from dt_bids b where b.listing_id = l.id and b.user_id = uid)
  );
  if p_full then
    j := j || jsonb_build_object(
      'reserve_cents', l.reserve_cents, 'cost_cents', l.cost_cents, 'created_at', l.created_at, 'updated_at', l.updated_at,
      'high_name', dt_name_of(l.high_user), 'high_email', (select email from auth.users where id = l.high_user),
      'winner_name', dt_name_of(l.winner), 'winner_email', (select email from auth.users where id = l.winner));
  end if;
  return j::json;
end $$;

-- 3) Closing auctions. Runs whenever anyone opens the store, and every minute if 3-schedule.sql is set up.
create or replace function public.dt_close_listing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l dt_listings; s dt_shop; other record;
begin
  select * into l from dt_listings where id = p_id for update;
  if not found or l.status <> 'live' or l.kind <> 'auction' or l.ends_at > now() then return; end if;
  select * into s from dt_shop where id = 1;
  if l.bid_count > 0 and (l.reserve_cents is null or l.high_cents >= l.reserve_cents) then
    update dt_listings set status = 'sold', winner = l.high_user, final_cents = l.high_cents, quantity = 0,
           closed_at = now(), updated_at = now() where id = l.id;
    insert into dt_sales (listing_id, title, qty, amount_cents, cost_cents, channel, how, buyer_id, buyer_name, buyer_email)
      values (l.id, l.title, 1, l.high_cents, l.cost_cents, 'online', 'auction', l.high_user, dt_name_of(l.high_user),
              coalesce((select email from auth.users where id = l.high_user), ''));
    perform dt_notify(l.high_user, 'won', l.id, 'You won ' || l.title || ' for ' || dt_money(l.high_cents), s.payment_note);
    perform dt_notify_staff('sold', l.id, l.title || ' sold at auction for ' || dt_money(l.high_cents),
                            'Winner: ' || dt_name_of(l.high_user) || '. Arrange payment, then mark the sale paid.');
    for other in select distinct user_id from dt_bids where listing_id = l.id and user_id is distinct from l.high_user and user_id is not null loop
      perform dt_notify(other.user_id, 'lost', l.id, 'Bidding ended on ' || l.title, 'Someone else won this one. Thanks for bidding!');
    end loop;
  else
    update dt_listings set status = 'unsold', closed_at = now(), updated_at = now() where id = l.id;
    perform dt_notify_staff('unsold', l.id, l.title || ' ended without a sale',
                            case when l.bid_count = 0 then 'No bids.' else 'The reserve wasn''t met (high bid ' || dt_money(l.high_cents) || ').' end);
    if l.high_user is not null then
      perform dt_notify(l.high_user, 'reserve', l.id, 'Bidding ended on ' || l.title, 'The reserve price wasn''t met, so it didn''t sell.');
    end if;
  end if;
end $$;

create or replace function public.dt_close_due() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from dt_listings where status = 'live' and kind = 'auction' and ends_at <= now()
           order by ends_at limit 200 for update skip locked loop
    perform dt_close_listing(r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- 4) Anyone (no sign-in needed): the storefront and one listing
create or replace function public.dt_storefront() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform dt_close_due();
  return (select json_build_object(
    'shop', (select json_build_object('name', name, 'tagline', tagline, 'about', about, 'contact_email', contact_email,
                                      'extend_minutes', extend_minutes) from dt_shop where id = 1),
    'now', now(),
    'live', coalesce((select json_agg(dt_view(id) order by case when kind = 'auction' then ends_at end nulls last, published_at desc)
                      from dt_listings where status = 'live'), '[]'::json),
    'sold', coalesce((select json_agg(dt_view(id) order by closed_at desc) from
                      (select id, closed_at from dt_listings where status = 'sold' and closed_at > now() - interval '180 days'
                       order by closed_at desc limit 60) x), '[]'::json)));
end $$;

create or replace function public.dt_listing(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings; staff boolean := dt_is_staff();
begin
  perform dt_close_listing(p_id);
  select * into l from dt_listings where id = p_id;
  if not found or (l.status in ('draft','withdrawn') and not staff) then raise exception 'That item isn''t available.'; end if;
  return (dt_view(p_id, staff)::jsonb || jsonb_build_object(
    'bids', coalesce((select jsonb_agg(jsonb_build_object(
              'amount_cents', b.amount_cents, 'at', b.at, 'you', coalesce(b.user_id = auth.uid(), false),
              'name', case when staff then dt_name_of(b.user_id) else dt_mask(dt_name_of(b.user_id)) end) order by b.at desc)
            from (select * from dt_bids where listing_id = p_id order by at desc limit 25) b), '[]'::jsonb),
    'now', now(), 'extend_minutes', (select extend_minutes from dt_shop where id = 1)))::json;
end $$;

-- 5) Signed-in buyers
create or replace function public.dt_me() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  return json_build_object(
    'user_id', uid, 'email', (select email from auth.users where id = uid),
    'name', coalesce((select name from dt_profiles where user_id = uid), ''),
    'role', (select role from dt_staff where user_id = uid),
    'unread', (select count(*) from dt_notices where user_id = uid and not read),
    'notices', coalesce((select json_agg(json_build_object('id', id, 'kind', kind, 'listing_id', listing_id, 'title', title,
                                                           'body', body, 'at', at, 'read', read) order by at desc)
                         from (select * from dt_notices where user_id = uid order by at desc limit 40) n), '[]'::json),
    'bids', coalesce((select json_agg(dt_view(x.listing_id)::jsonb || jsonb_build_object('my_top', x.top) order by x.last desc)
                      from (select listing_id, max(amount_cents) top, max(at) last from dt_bids where user_id = uid
                            group by listing_id order by max(at) desc limit 50) x), '[]'::json),
    'purchases', coalesce((select json_agg(json_build_object('id', s.id, 'order_id', s.order_id, 'variant', s.variant, 'listing_id', s.listing_id, 'title', s.title, 'qty', s.qty,
                                                             'amount_cents', s.amount_cents, 'how', s.how, 'status', s.status, 'at', s.at,
                                                             'photo', (select l.photos->>0 from dt_listings l where l.id = s.listing_id)) order by s.at desc)
                           from dt_sales s where s.buyer_id = uid), '[]'::json),
    'payment_note', (select payment_note from dt_shop where id = 1));
end $$;

-- Called at every sign-in: makes sure there's a profile, then returns dt_me()
create or replace function public.dt_bootstrap() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  insert into dt_profiles (user_id, name)
    values (uid, left(split_part(coalesce(auth.jwt()->>'email',''), '@', 1), 40)) on conflict (user_id) do nothing;
  update dt_staff set email = lower(coalesce(auth.jwt()->>'email', email)) where user_id = uid;
  return dt_me();
end $$;

create or replace function public.dt_set_name(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if length(n) < 2 or length(n) > 40 then raise exception 'Use 2 to 40 characters for your name.'; end if;
  insert into dt_profiles (user_id, name) values (auth.uid(), n) on conflict (user_id) do update set name = excluded.name;
  return dt_me();
end $$;

create or replace function public.dt_notices_read() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  update dt_notices set read = true where user_id = auth.uid() and not read;
  return dt_me();
end $$;

-- Place a bid. The database decides: it locks the listing, checks the time against its own
-- clock, and checks the amount against the current high bid, so two people bidding at the same
-- moment can't both win and a phone with the wrong time can't sneak in late.
-- A bid in the last few minutes (shop setting, 2 by default) pushes the end time out so others can answer.
create or replace function public.dt_bid(p_id uuid, p_cents int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l dt_listings; minb int; prev uuid; ext int; extended boolean := false;
begin
  if uid is null then raise exception 'Sign in to bid.'; end if;
  if dt_is_staff() then raise exception 'Shop staff can''t bid on the shop''s own items.'; end if;
  if (select count(*) from dt_bids where user_id = uid and at > now() - interval '1 hour') >= 60 then
    raise exception 'That''s a lot of bids in one hour. Try again a little later.';
  end if;
  select * into l from dt_listings where id = p_id for update;
  if not found or l.kind <> 'auction' or l.status <> 'live' then raise exception 'This item isn''t open for bids.'; end if;
  if l.ends_at <= now() then
    perform dt_close_listing(p_id);
    return (dt_listing(p_id)::jsonb || jsonb_build_object('problem', 'Bidding has ended.'))::json;
  end if;
  if l.high_user = uid then raise exception 'You''re already the high bidder.'; end if;
  minb := case when l.bid_count = 0 then l.start_cents else l.high_cents + dt_increment(l.high_cents) end;
  if p_cents is null or p_cents < minb then raise exception 'Bid at least %.', dt_money(minb); end if;
  if p_cents > 10000000 then raise exception 'That bid is higher than this shop accepts.'; end if;
  prev := l.high_user;
  insert into dt_bids (listing_id, user_id, amount_cents) values (p_id, uid, p_cents);
  select extend_minutes into ext from dt_shop where id = 1;
  if l.ends_at < now() + make_interval(mins => ext) then
    l.ends_at := now() + make_interval(mins => ext); extended := true;
  end if;
  update dt_listings set high_cents = p_cents, high_user = uid, bid_count = bid_count + 1, ends_at = l.ends_at, updated_at = now()
    where id = p_id;
  if prev is not null and prev <> uid then
    perform dt_notify(prev, 'outbid', p_id, 'You''ve been outbid on ' || l.title,
                      'The high bid is now ' || dt_money(p_cents) || '. Bid again before it ends.');
  end if;
  return (dt_listing(p_id)::jsonb || jsonb_build_object('extended', extended))::json;
end $$;

-- Purchases still waiting for payment, counting a cart order once
create or replace function public.dt_unpaid_orders(u uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct coalesce(order_id, id))::int from dt_sales where buyer_id = u and status = 'awaiting payment'
$$;

-- Check out a cart: [{"listing_id": "...", "variant": "m-black", "qty": 2}, ...]
-- All or nothing: every line is checked against the stock at that moment (listings locked in a
-- fixed order so two checkouts can't deadlock), then one order is recorded with a sale per line.
create or replace function public.dt_checkout(p_items jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); oid uuid := gen_random_uuid(); it jsonb; l dt_listings; q int; label text;
        total int := 0; n int := 0; units int := 0; lines jsonb := '[]'::jsonb; pnote text; first_title text; lid uuid;
begin
  if uid is null then raise exception 'Sign in to check out.'; end if;
  if dt_is_staff() then raise exception 'Shop staff log sales in the back office instead.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_items) > 20 then raise exception 'Up to 20 different items per order.'; end if;
  if dt_unpaid_orders(uid) >= 5 then raise exception 'You have 5 purchases waiting for payment. Pay for those first.'; end if;
  -- lock every listing in the cart, always in the same order
  for lid in select distinct (x->>'listing_id')::uuid from jsonb_array_elements(p_items) x order by 1 loop
    perform 1 from dt_listings where id = lid for update;
  end loop;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into l from dt_listings where id = (it->>'listing_id')::uuid;
    if not found or l.status <> 'live' or l.kind <> 'fixed' then
      raise exception '%', coalesce(l.title, 'An item in your cart') || ' is no longer available.';
    end if;
    q := coalesce(nullif(it->>'qty','')::int, 1);
    if q < 1 or q > 100 then raise exception 'Check the quantity for %.', l.title; end if;
    label := dt_take_stock(l.id, coalesce(it->>'variant',''), q);
    insert into dt_sales (order_id, listing_id, title, qty, amount_cents, cost_cents, channel, how, buyer_id, buyer_name, buyer_email, variant_id, variant)
      values (oid, l.id, l.title, q, l.price_cents * q, case when l.cost_cents is not null then l.cost_cents * q end, 'online', 'buy', uid,
              dt_name_of(uid), coalesce((select email from auth.users where id = uid), ''), case when label <> '' then it->>'variant' else '' end, label);
    total := total + l.price_cents * q; n := n + 1; units := units + q; first_title := coalesce(first_title, l.title);
    lines := lines || jsonb_build_array(jsonb_build_object('listing_id', l.id, 'title', l.title, 'variant', label, 'qty', q, 'amount_cents', l.price_cents * q));
  end loop;
  select payment_note into pnote from dt_shop where id = 1;
  perform dt_notify(uid, 'bought', case when n = 1 then (lines->0->>'listing_id')::uuid end,
                    'You got ' || case when n = 1 then first_title || case when units > 1 then ' ×' || units else '' end else units || ' items' end || ' for ' || dt_money(total), pnote);
  perform dt_notify_staff('sold', case when n = 1 then (lines->0->>'listing_id')::uuid end,
                          dt_name_of(uid) || ' bought ' || case when n = 1 then first_title || case when units > 1 then ' ×' || units else '' end else units || ' items' end || ' for ' || dt_money(total),
                          'Arrange payment, then mark the order paid.');
  return json_build_object('order_id', oid, 'total_cents', total, 'units', units, 'lines', lines, 'payment_note', pnote);
end $$;

-- Buy a fixed-price item (some of its stock) or use Buy It Now on an auction
create or replace function public.dt_buy(p_id uuid, p_qty int default 1) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l dt_listings; q int := coalesce(p_qty, 1); price int; sid uuid; how text; pnote text;
begin
  if uid is null then raise exception 'Sign in to buy.'; end if;
  if dt_is_staff() then raise exception 'Shop staff log sales in the back office instead.'; end if;
  if dt_unpaid_orders(uid) >= 5 then
    raise exception 'You have 5 purchases waiting for payment. Pay for those first.';
  end if;
  select * into l from dt_listings where id = p_id for update;
  if not found or l.status <> 'live' then raise exception 'Sorry, that''s no longer available.'; end if;
  if l.kind = 'fixed' then
    if jsonb_array_length(l.variants) > 0 then raise exception 'Pick a size or color, then check out from your cart.'; end if;
    if q < 1 or q > l.quantity then raise exception 'Only % left.', l.quantity; end if;
    price := l.price_cents * q; how := 'buy';
    perform dt_take_stock(p_id, '', q);
  else
    if l.ends_at <= now() then
      perform dt_close_listing(p_id);
      return (dt_listing(p_id)::jsonb || jsonb_build_object('problem', 'Bidding has ended.'))::json;
    end if;
    if not dt_buy_now_open(l) then raise exception 'Buy It Now is gone: someone has already bid.'; end if;
    q := 1; price := l.buy_now_cents; how := 'buy now';
    update dt_listings set status = 'sold', quantity = 0, winner = uid, final_cents = price, closed_at = now(), updated_at = now()
      where id = p_id;
  end if;
  insert into dt_sales (listing_id, title, qty, amount_cents, cost_cents, channel, how, buyer_id, buyer_name, buyer_email)
    values (p_id, l.title, q, price, case when l.cost_cents is not null then l.cost_cents * q end, 'online', how, uid,
            dt_name_of(uid), coalesce((select email from auth.users where id = uid), ''))
    returning id into sid;
  select payment_note into pnote from dt_shop where id = 1;
  perform dt_notify(uid, 'bought', p_id, 'You got ' || l.title || case when q > 1 then ' ×' || q else '' end || ' for ' || dt_money(price), pnote);
  perform dt_notify_staff('sold', p_id, dt_name_of(uid) || ' bought ' || l.title || case when q > 1 then ' ×' || q else '' end || ' for ' || dt_money(price),
                          'Arrange payment, then mark the sale paid.');
  return (dt_listing(p_id)::jsonb || jsonb_build_object('sale_id', sid, 'paid_cents', price, 'payment_note', pnote))::json;
end $$;

-- 6) Shop staff
create or replace function public.dt_staff_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not dt_is_staff() then raise exception 'Only shop staff can do that.'; end if;
end $$;

create or replace function public.dt_staff_listings() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform dt_staff_check();
  perform dt_close_due();
  return coalesce((select json_agg(dt_view(id, true) order by
           case status when 'live' then 0 when 'draft' then 1 when 'unsold' then 2 when 'sold' then 3 else 4 end, updated_at desc)
         from dt_listings), '[]'::json);
end $$;

-- Create or change a listing. Once an auction has bids, only the wording, category, and photos can change.
create or replace function public.dt_save_listing(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings; pid uuid := nullif(p->>'id','')::uuid; v_photos jsonb := coalesce(p->'photos', '[]'::jsonb);
        k text := coalesce(p->>'kind','fixed'); ph text;
begin
  perform dt_staff_check();
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 8 then raise exception 'Up to 8 photos.'; end if;
  for ph in select jsonb_array_elements_text(v_photos) loop
    if ph !~ '^listings/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,60}\.(jpg|webp)$' then raise exception 'Unexpected photo name.'; end if;
  end loop;
  if pid is not null then select * into l from dt_listings where id = pid for update; end if;
  if l.id is null then
    insert into dt_listings (id, title) values (coalesce(pid, gen_random_uuid()), coalesce(nullif(trim(p->>'title'),''), 'Untitled'))
      returning * into l;
  end if;
  if l.status = 'sold' and l.kind = 'auction' then raise exception 'Sold listings can''t be changed. Relist it to sell another.'; end if;
  update dt_listings set
    title       = coalesce(nullif(trim(p->>'title'),''), title),
    description = coalesce(p->>'description', description),
    category    = left(trim(coalesce(p->>'category', category)), 40),
    line        = coalesce(p->>'line', line),
    photos      = v_photos,
    cost_cents  = case when p ? 'cost_cents' then nullif(p->>'cost_cents','')::int else cost_cents end,
    updated_at  = now()
  where id = l.id;
  if l.bid_count = 0 then
    update dt_listings set
      kind          = k,
      price_cents   = case when k = 'fixed' then nullif(p->>'price_cents','')::int end,
      variants      = case when k = 'fixed' then dt_clean_variants(p->'variants') else '[]'::jsonb end,
      quantity      = case when k = 'fixed' and jsonb_array_length(dt_clean_variants(p->'variants')) > 0
                             then (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(dt_clean_variants(p->'variants')) x)
                           when k = 'fixed' then coalesce(nullif(p->>'quantity','')::int, quantity) else 1 end,
      start_cents   = case when k = 'auction' then nullif(p->>'start_cents','')::int end,
      reserve_cents = case when k = 'auction' then nullif(p->>'reserve_cents','')::int end,
      buy_now_cents = case when k = 'auction' then nullif(p->>'buy_now_cents','')::int end,
      ends_at       = case when k = 'auction' then nullif(p->>'ends_at','')::timestamptz end
    where id = l.id;
  end if;
  select * into l from dt_listings where id = l.id;
  -- restocked a sold-out item: it goes back on sale
  if l.status = 'sold' and l.kind = 'fixed' and l.quantity > 0 then
    update dt_listings set status = 'live', closed_at = null, final_cents = null where id = l.id returning * into l;
  elsif l.status = 'live' and l.kind = 'fixed' and l.quantity = 0 then
    update dt_listings set status = 'sold', closed_at = now(), final_cents = l.price_cents where id = l.id returning * into l;
  end if;
  if l.status = 'live' then perform dt_check_ready(l); end if;
  return dt_view(l.id, true);
end $$;

-- What a listing needs before it can go live
create or replace function public.dt_check_ready(l public.dt_listings) returns void
language plpgsql stable set search_path = public as $$
begin
  if l.kind = 'fixed' then
    if l.price_cents is null then raise exception 'Set a price.'; end if;
    if l.quantity < 1 then raise exception '%', case when jsonb_array_length(l.variants) > 0 then 'Add stock for at least one size or color.' else 'Set how many you have.' end; end if;
  else
    if l.start_cents is null then raise exception 'Set a starting bid.'; end if;
    if l.ends_at is null then raise exception 'Set when bidding ends.'; end if;
    if l.reserve_cents is not null and l.reserve_cents < l.start_cents then raise exception 'The reserve can''t be below the starting bid.'; end if;
    if l.buy_now_cents is not null and l.buy_now_cents <= greatest(l.start_cents, coalesce(l.reserve_cents, 0)) then
      raise exception 'Buy It Now has to be more than the starting bid and the reserve.';
    end if;
  end if;
end $$;

create or replace function public.dt_publish(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings;
begin
  perform dt_staff_check();
  select * into l from dt_listings where id = p_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  if l.status not in ('draft','withdrawn') then raise exception 'Only drafts can be published.'; end if;
  perform dt_check_ready(l);
  if l.kind = 'auction' and l.ends_at < now() + interval '10 minutes' then raise exception 'Set bidding to end at least 10 minutes from now.'; end if;
  if l.kind = 'auction' and l.ends_at > now() + interval '30 days' then raise exception 'Auctions can run up to 30 days.'; end if;
  update dt_listings set status = 'live', published_at = now(), updated_at = now() where id = p_id;
  return dt_view(p_id, true);
end $$;

-- Take a live listing down. Auctions with bids can't be pulled (bidders are counting on them).
create or replace function public.dt_withdraw(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings;
begin
  perform dt_staff_check();
  select * into l from dt_listings where id = p_id for update;
  if not found or l.status <> 'live' then raise exception 'Only live listings can be taken down.'; end if;
  if l.bid_count > 0 then raise exception 'This auction has bids, so it has to run to the end.'; end if;
  update dt_listings set status = 'draft', updated_at = now() where id = p_id;
  return dt_view(p_id, true);
end $$;

-- Copy an ended listing into a new draft (to sell another one, or try again after no sale)
create or replace function public.dt_relist(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings; nid uuid;
begin
  perform dt_staff_check();
  select * into l from dt_listings where id = p_id;
  if not found or l.status not in ('sold','unsold') then raise exception 'Only ended listings can be relisted.'; end if;
  insert into dt_listings (title, description, line, category, kind, price_cents, start_cents, reserve_cents, buy_now_cents, cost_cents, quantity, photos, variants)
    values (l.title, l.description, l.line, l.category, l.kind, l.price_cents, l.start_cents, l.reserve_cents, l.buy_now_cents, l.cost_cents,
            case when jsonb_array_length(l.variants) > 0 then 0 else 1 end, l.photos,
            (select coalesce(jsonb_agg(x || '{"qty":0}'::jsonb), '[]'::jsonb) from jsonb_array_elements(l.variants) x))
    returning id into nid;
  return dt_view(nid, true);
end $$;

create or replace function public.dt_delete_listing(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform dt_staff_check();
  if not exists (select 1 from dt_listings where id = p_id and status = 'draft' and bid_count = 0)
     or exists (select 1 from dt_sales where listing_id = p_id) then
    raise exception 'Only drafts that never sold can be deleted.';
  end if;
  delete from dt_listings where id = p_id;
  return json_build_object('deleted', p_id);
end $$;

-- Log a sale made in person or at an event (takes it out of stock if it's a listed item)
create or replace function public.dt_log_sale(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare l dt_listings; pid uuid := nullif(p->>'listing_id','')::uuid; q int := coalesce(nullif(p->>'qty','')::int, 1);
        amt int := nullif(p->>'amount_cents','')::int; t text := trim(coalesce(p->>'title','')); sid uuid; label text := '';
begin
  perform dt_staff_check();
  if q < 1 then raise exception 'Quantity has to be at least 1.'; end if;
  if amt is null or amt < 0 then raise exception 'Enter what it sold for.'; end if;
  if pid is not null then
    select * into l from dt_listings where id = pid for update;
    if not found then raise exception 'Listing not found.'; end if;
    if l.kind = 'auction' then raise exception 'Auctions sell through bidding. Log a separate item instead.'; end if;
    if l.status not in ('draft','live') then raise exception 'Only 0 in stock.'; end if;
    if jsonb_array_length(l.variants) = 0 and l.quantity < q then raise exception 'Only % in stock.', coalesce(l.quantity, 0); end if;
    label := dt_take_stock(pid, coalesce(p->>'variant',''), q);
    t := l.title;
  end if;
  if t = '' then raise exception 'What did you sell?'; end if;
  insert into dt_sales (listing_id, title, qty, amount_cents, cost_cents, channel, event, how, buyer_name, seller_id, status, note, at, variant_id, variant)
    values (pid, left(t,120), q, amt,
            coalesce(nullif(p->>'cost_cents','')::int, case when l.cost_cents is not null then l.cost_cents * q end),
            coalesce(nullif(p->>'channel',''), 'in person'), left(coalesce(p->>'event',''), 80), 'manual',
            left(coalesce(p->>'buyer_name',''), 80), auth.uid(), coalesce(nullif(p->>'status',''), 'paid'),
            left(coalesce(p->>'note',''), 500), coalesce(nullif(p->>'at','')::timestamptz, now()),
            case when label <> '' then p->>'variant' else '' end, label)
    returning id into sid;
  return json_build_object('sale_id', sid);
end $$;

-- Move a sale along: awaiting payment -> paid -> complete, or cancel it (puts the item back).
-- A sale that's part of a cart order moves together with the rest of its order.
create or replace function public.dt_sale_status(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare s dt_sales; x dt_sales; l dt_listings; was text; n int := 0; total int := 0; first_title text;
begin
  perform dt_staff_check();
  if p_status not in ('awaiting payment','paid','complete','cancelled') then raise exception 'Unknown status.'; end if;
  select * into s from dt_sales where id = p_id for update;
  if not found then raise exception 'Sale not found.'; end if;
  if s.status = 'cancelled' then raise exception 'Cancelled sales stay cancelled. Log a new one instead.'; end if;
  was := s.status;
  for x in select * from dt_sales where (id = p_id or (s.order_id is not null and order_id = s.order_id)) and status <> 'cancelled'
           order by listing_id for update loop
    update dt_sales set status = p_status, updated_at = now() where id = x.id;
    n := n + 1; total := total + x.amount_cents; first_title := coalesce(first_title, x.title);
    if p_status = 'cancelled' and x.listing_id is not null then
      select * into l from dt_listings where id = x.listing_id;
      if l.kind = 'fixed' then perform dt_put_back(x.listing_id, x.variant_id, x.qty);
      else update dt_listings set status = 'unsold', winner = null, final_cents = null, updated_at = now() where id = l.id;
      end if;
    end if;
  end loop;
  if s.buyer_id is not null then
    if p_status = 'cancelled' then
      perform dt_notify(s.buyer_id, 'cancelled', case when n = 1 then s.listing_id end,
                        'Your purchase of ' || case when n = 1 then first_title else n || ' items' end || ' was cancelled', 'Contact the shop if this is a surprise.');
    elsif p_status = 'paid' and was = 'awaiting payment' then
      perform dt_notify(s.buyer_id, 'paid', case when n = 1 then s.listing_id end,
                        'Payment received for ' || case when n = 1 then first_title else 'your order (' || dt_money(total) || ')' end, 'Thank you!');
    end if;
  end if;
  return json_build_object('id', p_id, 'status', p_status, 'sales', n);
end $$;

create or replace function public.dt_sales_list(p_days int default 90) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform dt_staff_check();
  return coalesce((select json_agg(json_build_object(
      'id', s.id, 'order_id', s.order_id, 'variant', s.variant, 'listing_id', s.listing_id, 'title', s.title, 'qty', s.qty, 'amount_cents', s.amount_cents, 'cost_cents', s.cost_cents,
      'channel', s.channel, 'event', s.event, 'how', s.how, 'status', s.status, 'note', s.note, 'at', s.at,
      'buyer_name', s.buyer_name, 'buyer_email', s.buyer_email,
      'seller', case when s.seller_id is null then 'Online store' else dt_name_of(s.seller_id) end,
      'photo', (select l.photos->>0 from dt_listings l where l.id = s.listing_id)) order by s.at desc)
    from dt_sales s where s.at > now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 3660))), '[]'::json);
end $$;

-- The dashboard: sales totals, a day-by-day chart, who sold what, best sellers, and stock.
-- Cancelled sales don't count. Days follow the shop's time zone.
create or replace function public.dt_dashboard(p_days int default 30) returns json
language plpgsql security definer set search_path = public as $$
declare z text; d int := least(greatest(coalesce(p_days, 30), 7), 365); today date; lo int;
begin
  perform dt_staff_check();
  select tz, low_stock into z, lo from dt_shop where id = 1;
  today := (now() at time zone z)::date;
  return json_build_object(
    'days', d, 'today', today,
    'totals', (select json_build_object(
        'today', coalesce(sum(amount_cents) filter (where (at at time zone z)::date = today), 0),
        'week',  coalesce(sum(amount_cents) filter (where (at at time zone z)::date > today - 7), 0),
        'month', coalesce(sum(amount_cents) filter (where (at at time zone z)::date > today - 30), 0),
        'period', coalesce(sum(amount_cents) filter (where (at at time zone z)::date > today - d), 0),
        'period_count', count(*) filter (where (at at time zone z)::date > today - d),
        'period_units', coalesce(sum(qty) filter (where (at at time zone z)::date > today - d), 0),
        'period_profit', sum(amount_cents - cost_cents) filter (where (at at time zone z)::date > today - d and cost_cents is not null),
        'all', coalesce(sum(amount_cents), 0),
        'awaiting', coalesce(sum(amount_cents) filter (where status = 'awaiting payment'), 0),
        'awaiting_count', count(distinct coalesce(order_id, id)) filter (where status = 'awaiting payment'))
      from dt_sales where status <> 'cancelled'),
    'series', (select json_agg(json_build_object('day', g::date, 'cents', coalesce(x.c, 0), 'count', coalesce(x.n, 0)) order by g)
               from generate_series(today - (d - 1), today, interval '1 day') g
               left join (select (at at time zone z)::date dd, sum(amount_cents) c, count(*) n from dt_sales
                          where status <> 'cancelled' group by 1) x on x.dd = g::date),
    'sellers', coalesce((select json_agg(json_build_object('name', nm, 'cents', c, 'count', n, 'units', u) order by c desc)
               from (select case when seller_id is null then 'Online store' else dt_name_of(seller_id) end nm,
                            sum(amount_cents) c, count(*) n, sum(qty) u
                     from dt_sales where status <> 'cancelled' and (at at time zone z)::date > today - d group by 1) s), '[]'::json),
    'best', coalesce((select json_agg(json_build_object('title', title, 'cents', c, 'units', u, 'line', line) order by c desc, u desc)
               from (select s.title, sum(s.amount_cents) c, sum(s.qty) u, max(l.line) line from dt_sales s
                     left join dt_listings l on l.id = s.listing_id
                     where s.status <> 'cancelled' and (s.at at time zone z)::date > today - d
                     group by s.title order by sum(s.amount_cents) desc, sum(s.qty) desc limit 5) b), '[]'::json),
    'stock', json_build_object(
        'low_stock', lo,
        'live_fixed', (select count(*) from dt_listings where status = 'live' and kind = 'fixed'),
        'live_auctions', (select count(*) from dt_listings where status = 'live' and kind = 'auction'),
        'drafts', (select count(*) from dt_listings where status = 'draft'),
        'low', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'variant', variant, 'quantity', quantity) order by quantity, title, variant)
                         from (select id, title, '' variant, quantity from dt_listings
                                where status = 'live' and kind = 'fixed' and jsonb_array_length(variants) = 0 and quantity <= lo
                               union all
                               select l.id, l.title, dt_variant_label(v), (v->>'qty')::int from dt_listings l, jsonb_array_elements(l.variants) v
                                where l.status = 'live' and l.kind = 'fixed' and (v->>'qty')::int <= lo) lw), '[]'::json),
        'sold_out', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'closed_at', closed_at) order by closed_at desc)
                         from (select * from dt_listings where status = 'sold' and kind = 'fixed' order by closed_at desc limit 10) x), '[]'::json),
        'ending', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'ends_at', ends_at, 'high_cents', high_cents,
                                                              'bid_count', bid_count) order by ends_at)
                         from dt_listings where status = 'live' and kind = 'auction' and ends_at < now() + interval '2 days'), '[]'::json)));
end $$;

-- Join the shop staff with the share key (the owner reads it from Shop settings)
create or replace function public.dt_join_staff(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if dt_is_staff() then return dt_me(); end if;
  if (select count(*) from dt_join_tries where user_id = uid and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong keys. Try again in an hour.';
  end if;
  if not exists (select 1 from dt_shop where id = 1 and join_code = dt_fmt_code(p_code)) then
    insert into dt_join_tries (user_id) values (uid);
    return json_build_object('problem', 'That share key doesn''t match. Check it with the shop owner.');
  end if;
  if exists (select 1 from dt_bids where user_id = uid) then
    raise exception 'This account has bid on shop items, so it can''t become staff. Use a separate account for selling.';
  end if;
  insert into dt_staff (user_id, email, role) values (uid, lower(coalesce(auth.jwt()->>'email','')), 'seller') on conflict do nothing;
  return dt_me();
end $$;

-- Owner only: shop details and the staff list
create or replace function public.dt_shop_admin() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform dt_staff_check();
  return (select json_build_object('name', name, 'tagline', tagline, 'about', about, 'payment_note', payment_note,
            'contact_email', contact_email, 'low_stock', low_stock, 'extend_minutes', extend_minutes, 'tz', tz,
            'owner', dt_is_owner(),
            'join_code', case when dt_is_owner() then join_code end,
            'staff', coalesce((select json_agg(json_build_object('user_id', s.user_id, 'email', s.email, 'name', dt_name_of(s.user_id),
                                                                 'role', s.role, 'me', s.user_id = auth.uid()) order by s.role, s.joined_at)
                               from dt_staff s), '[]'::json))
          from dt_shop where id = 1);
end $$;

create or replace function public.dt_save_shop(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_owner() then raise exception 'Only the shop owner can change shop settings.'; end if;
  if p ? 'tz' and not exists (select 1 from pg_timezone_names where name = p->>'tz') then raise exception 'Unknown time zone.'; end if;
  update dt_shop set
    name           = left(coalesce(nullif(trim(p->>'name'),''), name), 40),
    tagline        = left(coalesce(p->>'tagline', tagline), 80),
    about          = left(coalesce(p->>'about', about), 1000),
    payment_note   = left(coalesce(nullif(trim(p->>'payment_note'),''), payment_note), 500),
    contact_email  = case when p ? 'contact_email' then nullif(trim(p->>'contact_email'),'') else contact_email end,
    low_stock      = coalesce(nullif(p->>'low_stock','')::int, low_stock),
    extend_minutes = coalesce(nullif(p->>'extend_minutes','')::int, extend_minutes),
    tz             = coalesce(nullif(p->>'tz',''), tz),
    updated_at     = now()
  where id = 1;
  return dt_shop_admin();
end $$;

create or replace function public.dt_new_code() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_owner() then raise exception 'Only the shop owner can change the share key.'; end if;
  update dt_shop set join_code = dt_fmt_code(dt_gen_code()) where id = 1;
  return dt_shop_admin();
end $$;

create or replace function public.dt_remove_staff(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_owner() then raise exception 'Only the shop owner can remove staff.'; end if;
  if exists (select 1 from dt_staff where user_id = p_user and role = 'owner') then raise exception 'The owner can''t be removed here.'; end if;
  delete from dt_staff where user_id = p_user;
  return dt_shop_admin();
end $$;

-- For the SQL Editor only (not callable from the app): make an account the shop owner.
--   select public.dt_make_owner('you@example.com');
create or replace function public.dt_make_owner(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'No account uses %. Sign up in the app first.', p_email; end if;
  insert into dt_staff (user_id, email, role) values (u, lower(trim(p_email)), 'owner')
    on conflict (user_id) do update set role = 'owner';
  return lower(trim(p_email)) || ' is now the shop owner';
end $$;

-- 7) Who may call what. Supabase lets everyone run new functions by default, so start from nothing.
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'dt\_%' loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;
-- anyone (the storefront works without signing in)
grant execute on function public.dt_storefront(), public.dt_listing(uuid), public.dt_close_due() to anon, authenticated;
-- signed in
grant execute on function public.dt_me(), public.dt_bootstrap(), public.dt_set_name(text), public.dt_notices_read(),
  public.dt_bid(uuid, int), public.dt_buy(uuid, int), public.dt_checkout(jsonb), public.dt_join_staff(text), public.dt_is_staff(),
  public.dt_staff_listings(), public.dt_save_listing(jsonb), public.dt_publish(uuid), public.dt_withdraw(uuid),
  public.dt_relist(uuid), public.dt_delete_listing(uuid), public.dt_log_sale(jsonb), public.dt_sale_status(uuid, text),
  public.dt_sales_list(int), public.dt_dashboard(int), public.dt_shop_admin(), public.dt_save_shop(jsonb),
  public.dt_new_code(), public.dt_remove_staff(uuid) to authenticated;
-- dt_make_owner and the helpers stay with the database owner (SQL Editor)

insert into public.dt_schema_log (script, version) values ('1-shop.sql', '0.2');
