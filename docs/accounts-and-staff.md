# Accounts and staff

## Signing up
Anyone can create an account with an email, a password (8+ characters), and a name. Supabase emails a
confirmation link; until it's opened, signing in says to confirm first. The link opens the shop already
signed in. **Forgot your password?** emails a reset link that opens a "choose a new password" screen.

Sign-ins last an hour and renew quietly in the background, so people stay signed in on their phone.

## Roles

| Role | How you get it | Can |
|---|---|---|
| Visitor | Nothing | Browse the shop and look at any live or sold item |
| Buyer | Create an account | Bid, buy, see their own bids, purchases, and notices, set their name |
| Seller | Buyer account + the share key | Everything in the back office except shop settings and the staff list |
| Owner | `select public.dt_make_owner('email')` in the SQL Editor | Also shop settings, the share key, removing sellers |

Staff must use **two-step sign-in**: a code from an authenticator app as well as the password. The
database checks it (the sign-in's `aal2` level): with only a password, a staff account can't reach
listings, sales, the dashboard, Admin, settings, or photo uploads. Joining the staff works with just a
password, so a new seller can join and then set up the app.

Staff can't bid or buy (so nobody can push up prices on their own items). An account that has ever bid
can't join the staff; use a separate account for selling.

## The share key
Owners see it in **Account → Shop settings**, like `K7QM-4XPD-R9TW-2HBN`: 16 characters from a strong
random source (no 0/O/1/I/L to avoid mix-ups). A new
seller signs in, opens **Account → Work for this shop?**, and types it (upper or lower case, dash optional).
10 wrong keys in an hour locks that account out of trying for an hour. **New key** stops the old one
working; current staff stay.

## Who can see what

| | Visitor | Buyer | Staff |
|---|---|---|---|
| Live and recently sold listings | ✓ | ✓ | ✓ |
| Drafts and taken-down listings | | | ✓ |
| Reserve amount, cost | | | ✓ |
| Bidders | masked | masked, "You" for theirs | full name |
| High bidder's and winner's email | | | ✓ |
| Their own bids, purchases, notices | | ✓ | ✓ |
| Sales log, dashboard | | | ✓ |
| Share key | | | owner only |

The database enforces this: tables can't be read directly at all, only through the functions in
`supabase/1-shop.sql`, each of which checks who's asking. See [how-it-works.md](how-it-works.md#security).

## Blocking a buyer
**Admin → Customers → (the person) → Block from buying and bidding**, with an optional note for yourself.
They can still sign in, browse, and see their past orders, with a banner saying their account can't buy.
Their open orders stay as they are. Staff can't be blocked (remove them from staff first), and you can't
block yourself.

## Removing people
- A seller: **Account → Staff → Remove** (owner). Only their staff access goes; their account stays and
  works like any buyer's from then on.
- Any account entirely: **Supabase → Authentication → Users → Delete user**. Their bids and sales stay
  (with the person cleared); notices and their profile go.
