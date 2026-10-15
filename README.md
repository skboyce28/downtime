# Downtime

**Downtime · goods by SB.co.** A storefront for custom-branded goods, one-offs, and resale finds, with
auctions, fixed-price items, and a back office for the people who sell them. It's one web page that
installs on a phone like an app, runs on your own Supabase project, and deploys to Netlify only after
its tests pass.

| | |
|---|---|
| **Storefront** | Anyone can browse without an account: photos, prices, live countdowns, **sections** from your categories (Shirts, Hats, Sunglasses, Odds & ends…), **search**, and sold-out items greyed at the end of their section. |
| **Auctions** | Starting bid, optional reserve (bidders see "met" or "not met", never the amount), optional Buy It Now (until the first bid), and late bids add time so nobody wins by sniping. Bid steps grow with the price. |
| **Fixed price** | A price and stock, or **sizes and colors** with stock for each. Buyers pick, then add to the **cart** or buy now. |
| **Cart** | Check out several things as one order (all or nothing), with one payment for you to collect. |
| **Accounts** | Email and password, with the email confirmed before the first sign-in. Bidders show masked to others ("J•••n"). |
| **Notices** | Outbid, won, bought, ended without a sale, payment received: in the app, with a badge. |
| **Back office** | Listings with up to 8 photos each (shrunk on the phone before upload), drafts, publishing, taking down, restocking, relisting. Orders and a sales log for things sold in person or at events. |
| **Dashboard** | Today, 7 and 30 days, awaiting payment, sales per day, by seller, best sellers, low stock (by size and color), and auctions ending soon. Profit wherever costs are filled in. |
| **Staff** | One owner (set once in the SQL Editor) and any number of sellers who join with a share key. Staff can't bid. |
| **Payments** | Not in the app yet: when something sells, both sides get a notice and you send a PayPal or Venmo request. See [Known limits](#known-limits). |

## Quick start

1. Make a Supabase project, run `supabase/1-shop.sql`, `2-photos.sql`, and (recommended) `3-schedule.sql`, and set up email. [docs/setup.md](docs/setup.md)
2. Put this repo on GitHub and connect it to Netlify with two environment variables. [docs/deployment.md](docs/deployment.md)
3. Sign up in the app, then make yourself the owner with one line in the SQL Editor. [docs/accounts-and-staff.md](docs/accounts-and-staff.md)

## Documentation

- [Setup](docs/setup.md): Supabase, email, the scripts in order, first owner
- [Using Downtime](docs/using-downtime.md): every screen, for buyers and staff
- [Accounts and staff](docs/accounts-and-staff.md): sign-up, roles, the share key, who can see what
- [How it works](docs/how-it-works.md): architecture, the bidding rules, tables, functions, security
- [Deployment](docs/deployment.md): Netlify, the deploy gate, keys and secrets, admin queries, decisions
- [Troubleshooting](docs/troubleshooting.md)
- [Changelog](CHANGELOG.md) · [Tests](tests/README.md)

## Repo layout

```
downtime.html             the whole app: markup, styles, one script, no frameworks
build_pwa.py              builds pwa/ for Netlify (config, manifest, service worker, security headers)
netlify.toml              build command, publish folder, deploy gate
supabase/1-shop.sql       tables and every function the app calls (run first)
supabase/2-photos.sql     the listing-photos storage bucket and who can upload
supabase/3-schedule.sql   closes auctions every minute (optional, needs pg_cron)
supabase/admin-queries.sql numbered operator queries
tools/netlify_ignore.py   deploy gate;  tools/make_icons.py  draws icons/
docs/                     the documentation above
tests/                    database and phone tests (run.mjs, support/, *.test.mjs)
.github/workflows/        tests on every push; deploy after they pass
```

## Privacy

The database decides who sees what. Shoppers see listings, prices, and masked bidder names. Buyers see
their own bids, purchases, and notices. Staff see buyer names and emails for sales, the reserve, and costs.
Nothing about buyers is in this repo or the hosted page; the page only holds the Supabase address and
its publishable key, which are meant to be public. Photos are public by address, like any shop photo.

## Known limits

- **Payments happen outside the app** for now (PayPal, Venmo, cash). Stripe or PayPal checkout is the next big step.
- **Notices are in the app only.** Email alerts for outbid and won are planned.
- **Bidding is straight bidding**, not automatic "max bid" proxy bidding.
- **One shop per Supabase project.**
- **Supabase's built-in email** only reaches your own team's addresses, 2 an hour. Real buyers need custom SMTP before launch ([setup](docs/setup.md#3-email)).
- Not legal advice: have someone review your terms of sale (bids are binding, returns, shipping) before you open to the public.

## Built with AI

Designed and built with Claude (Anthropic), from the owner's direction, on the same platform as Cradle.

## License

Copyright © 2026 SB.co. All rights reserved. See [LICENSE](LICENSE).
