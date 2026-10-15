# How it works

## Pieces

```
 phone (downtime.html, installed as an app)
   │  storefront, bids, buys, back office: HTTPS calls to database functions
   │  photos: uploaded by staff, shown to everyone by address
   ▼
 Supabase project
   ├─ Auth          accounts, email confirmation, password reset
   ├─ Postgres      dt_* tables (row-level security on, no direct access) + dt_* functions
   ├─ Storage       listing-photos bucket (public to read, staff-only to add or remove)
   └─ pg_cron       closes auctions every minute (optional, 3-schedule.sql)
```

The app is one HTML file with one script and no frameworks. The cart lives on the phone (browser storage)
until checkout; everything else lives in the database. Netlify serves it (see
[deployment.md](deployment.md)); it talks only to your Supabase project.

## Why the shop is online-first (unlike Cradle)
Cradle keeps the whole log on the phone and syncs in the background. A shop can't: who's winning, what's
in stock, and when an auction ends have to be decided in one place at one moment, or two people could buy
the last item. So every bid, purchase, and change goes straight to the database, which decides. The app
still opens offline (the service worker keeps the page) and shows the last storefront it saw, with a
banner saying bids and purchases need a connection.

## Bidding, step by step (`dt_bid`)
1. Not signed in, or on staff → refused. More than 60 bids in an hour → refused.
2. The listing row is **locked** (`select ... for update`), so bids on the same item go one at a time.
   Two equal bids at the same moment: the first wins, the second is told the new minimum.
3. Past its end time by the **database's clock** → the auction is closed right there and the bid is turned
   away with "Bidding has ended." Phone clocks don't matter.
4. Already the high bidder → refused. Below the minimum (the starting bid, or the high bid plus the step) → refused with the amount.
5. The bid is saved; if fewer than *extend minutes* (2 by default) are left, the end moves to that many
   minutes from now. The previous high bidder gets an "outbid" notice.

Steps: `dt_increment(cents)` = $1 under $25, $2 under $100, $5 under $250, $10 under $1,000, then $25.

## Closing an auction (`dt_close_listing`, `dt_close_due`)
Runs when anyone opens the storefront or that listing, and every minute with `3-schedule.sql`.
- Bids and the reserve met (or no reserve) → **sold** to the high bidder at their bid; a sale is recorded
  as *awaiting payment*; the winner, the staff, and every other bidder get notices.
- Otherwise → **unsold**; staff and the high bidder (if any) are told why.

## Buying
**Checkout (`dt_checkout`)** takes the cart as `[{listing_id, variant, qty}]`. It locks every listing in the
cart (always in the same order, so two checkouts can't deadlock), then for each line checks it's live, fixed
price, and has enough stock (of that size and color, when it has options), and takes it off. Any problem
stops the whole order with a message naming the item. Otherwise it records one **order**: a sale per line,
all sharing an `order_id`, each *awaiting payment*, and sends one notice to the buyer and one to staff.

**Buy It Now (`dt_buy`)** works the same way for a single auction (only until the first bid). It also still
buys plain fixed-price items without options.

A buyer can have at most 5 unpaid orders at once (an order counts once, however many lines it has).

## Sizes and colors
A fixed-price listing can have `variants`: `[{"id":"m-black","size":"M","color":"Black","qty":3}]`.
The id comes from the size and color, so it stays the same when you edit the list. The listing's `quantity`
is always the total. `dt_take_stock` and `dt_put_back` change one option's count and the total together;
the listing turns *sold* at 0 and back to *live* when stock returns. Sales remember the option's id and
label, so a cancelled sale goes back to the right size.

## Tables

| Table | Holds |
|---|---|
| `dt_shop` | The one shop row: name, tagline, about, payment note, contact, share key, low-stock level, late-bid minutes, time zone |
| `dt_staff` | Owner and sellers |
| `dt_profiles` | Everyone's display name |
| `dt_listings` | Listings, their prices, stock and sizes/colors (`variants`), end time, status (draft, live, sold, unsold, withdrawn), photos, and the current high bid |
| `dt_bids` | Every bid |
| `dt_sales` | Online and logged sales, with status (awaiting payment, paid, complete, cancelled), the option sold, and the cart order they belong to (`order_id`) |
| `dt_notices` | In-app notices |
| `dt_join_tries` | Wrong share keys (rate limit) |
| `dt_schema_log` | Which scripts ran |

Money is whole cents everywhere. Deleting an account clears it from bids and sales (they stay) and removes
its profile, notices, and staff role.

## Functions the app calls

| Function | Who | Does |
|---|---|---|
| `dt_storefront()` | anyone | Closes due auctions; shop info, live listings, recently sold |
| `dt_listing(id)` | anyone | One listing with its last 25 bids (masked unless staff); drafts only for staff |
| `dt_close_due()` | anyone | Closes auctions past their end (harmless to call) |
| `dt_bootstrap()`, `dt_me()` | signed in | Profile, role, notices, bids, purchases, payment note |
| `dt_set_name(name)`, `dt_notices_read()` | signed in | |
| `dt_bid(id, cents)`, `dt_checkout(items)`, `dt_buy(id, qty)` | buyers | See above |
| `dt_join_staff(code)` | signed in | Join with the share key |
| `dt_staff_listings()`, `dt_save_listing(json)`, `dt_publish`, `dt_withdraw`, `dt_relist`, `dt_delete_listing` | staff | Listings |
| `dt_log_sale(json)`, `dt_sale_status(id, status)`, `dt_sales_list(days)` | staff | Sales |
| `dt_dashboard(days)` | staff | Everything on the dashboard, in one call |
| `dt_shop_admin()` | staff | Settings and staff list (share key for the owner only) |
| `dt_save_shop(json)`, `dt_new_code()`, `dt_remove_staff(user)` | owner | |
| `dt_sale_invoiced(id, on)`, `dt_sale_remind(id)` | staff | Mark an order invoiced (buyer notified once); remind (once a day) |
| `dt_admin_overview()`, `dt_admin_customer(user)`, `dt_admin_block(user, on, note)` | owner | The Admin tab |
| `dt_make_owner(email)` | SQL Editor only | First owner |

Answers that report a soft problem (wrong share key, "Bidding has ended") use a `problem` field, not
`error`, so the database's work in that call (like closing the auction) still counts.

## Security

- **Two-step sign-in for staff.** `dt_is_staff()` and `dt_is_owner()` require `aal2` in the sign-in token
  (the authenticator code step). Everything staff-only goes through them, including the photo storage rules.
  `dt_staff_member()` (no code needed) only stops staff from bidding or buying. Blocked buyers are stopped
  in `dt_bid`, `dt_buy`, and `dt_checkout`.
- **The database decides.** Every `dt_*` table has row-level security on and *no* policies, so the
  publishable key can't read or write any table directly. Functions run as the database owner with a fixed
  `search_path` and check the caller themselves. Execute rights start from nothing (`revoke ... from public,
  anon, authenticated`) and are granted per function: three to `anon`, the rest to `authenticated`.
- **Photos.** Storage policies let staff add and remove files in `listing-photos`; the bucket only takes
  JPEG and WebP up to 2 MB. Photo names are checked (`listings/<id>/<name>.jpg|webp`) before they're
  attached to a listing.
- **The page.** A Content-Security-Policy allows only the app's own script (by SHA-256 hash), connections
  and images only from this site and the Supabase project, and no framing. See [deployment.md](deployment.md).
- **Abuse limits.** 60 bids an hour per account, 5 unpaid orders per buyer, 20 different items per order,
  10 wrong share keys an hour.

### How each connection authenticates

| From | To | Credential | Allowed to |
|---|---|---|---|
| Phone (signed out) | Supabase REST | publishable key | 3 functions: storefront, listing, close due |
| Phone (signed in) | Supabase REST and Storage | publishable key + the person's access token | Functions for their role; staff upload photos |
| Phone | Supabase Storage (public URL) | none | Read photos |
| Phone | Supabase Auth | publishable key | Sign up, sign in, renew, reset password |
| pg_cron | Postgres | runs inside the database | `dt_close_due()` |
| GitHub Actions | Netlify | `NETLIFY_BUILD_HOOK` secret | Start a production build |
| Netlify build | GitHub API | none (or nothing, for a private repo) | Read whether tests passed |
