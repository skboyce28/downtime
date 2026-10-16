# Tests

The runner sets up a throwaway Postgres database with Supabase-like roles (`support/auth-shim.sql`) and
Downtime's real SQL, builds the site three ways, starts a stand-in for Supabase's API
(`support/supabase-standin.mjs`: auth with email confirmation, function calls, photo storage) and a
stand-in for Netlify that serves the build with its real headers (`support/site-server.mjs`), then runs
every `*.test.mjs`. Browser tests drive Chromium as Android phones.

```
cd tests && npm ci && npx playwright install chromium
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node run.mjs [filter...]
```

Never point `DATABASE_URL` at a real Supabase project. Logs and screenshots land in `tests/out/`.
GitHub Actions runs the same thing on every push (`.github/workflows/tests.yml`).

| File | Checks |
|---|---|
| `accounts.test.mjs` | Typing right away lands in the right boxes; sign-up needs a confirmed email; the link signs you in with your chosen name; wrong password; forgot password and the reset link; sign-ins renew |
| `admin.test.mjs` | Database: only the owner opens Admin; owed, not invoiced, overdue; invoiced (whole order, buyer told once, undo); reminders (once a day, no account); customers and totals; one customer; blocking and unblocking; overdue setting |
| `admin-ui.test.mjs` | Phone: shopper view (customer tabs and cart, no staff details, checkout explains, survives reload, back to owner view); Admin numbers and unpaid list; Mark invoiced and Send reminder (buyer sees both); customer search, detail, block (buyer sees banner, checkout refused), unblock; 30 then Show all; overdue setting; item links (Share copies, the share menu gets title/price/link, a link opens the item, closing restores the address); Back button and the phone's back button close an item (also from a shared link), forward reopens it |
| `backoffice.test.mjs` | Two-step setup after joining (QR, key, app link), wrong code, code on a second phone; staff tabs; Take photo (camera) and Choose photos (gallery); a listing with photos (shrunk, uploaded, shown to visitors); buyers can't upload; auction validation; take down and delete; logging an event sale; marking paid; the dashboard; shop settings; joining with the share key |
| `bidding.test.mjs` | Database rules: who can call what; reserve, Buy It Now, and end-time checks; bid minimums and steps; masked bidders; two equal bids at once; late-bid extension; closing sold and unsold; Buy It Now; editing after bids; stock; unpaid-purchase limit; share-key limits |
| `cart.test.mjs` | Sections from categories, search (descriptions, colors), picking a size and color (sold-out crossed out), adding to the cart (capped by stock), the cart surviving a reload, checkout asking to sign in, one order in Yours and Sales, a stale cart, staff with no cart, the sizes × colors editor, restocking, logging a size, low stock by size |
| `mfa.test.mjs` | Database: 16-character keys (unique, any case, old keys replaced); password-only staff locked out of every staff-only thing including photo uploads; the code step opens it; joining before setup |
| `deploy-gate.test.mjs` | Netlify skips untested, failed, and not-yet-tested commits and builds passed ones |
| `sales.test.mjs` | Database: event and unlisted sales, stock, paid and cancelled sales, dashboard totals, chart, sellers, best sellers, low stock, time zone |
| `security-headers.test.mjs` | Script policy (injected and outside scripts blocked, outside connections blocked), no framing, headers, version.json, build refuses secret keys and missing config, unconfigured site explains itself |
| `store.test.mjs` | Database: options saved and checked, checkout all-or-nothing, two buyers racing for the last one, orders paid and cancelled together (stock back on the right size), restocking, relisting with options, low stock per option, unpaid-order limit |
| `storefront.test.mjs` | The plain downtime. logo in its own typeface and the font license; browsing signed out; filters and countdowns; an item's page; sign in to bid; bids too low, OK, outbid (the page updates itself); late-bid extension; buying stock; Buy It Now; Yours; winning; dark mode; layout widths, including 320 and 360 px phones signed out and with a long name |

Each test file starts with the shop's default settings (the runner resets them). Account names get a
random suffix so reruns don't collide.
