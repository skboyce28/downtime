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
| `accounts.test.mjs` | Sign-up needs a confirmed email; the link signs you in with your chosen name; wrong password; forgot password and the reset link; sign-ins renew |
| `backoffice.test.mjs` | Staff tabs; a listing with photos (shrunk, uploaded, shown to visitors); buyers can't upload; auction validation; take down and delete; logging an event sale; marking paid; the dashboard; shop settings; joining with the share key |
| `bidding.test.mjs` | Database rules: who can call what; reserve, Buy It Now, and end-time checks; bid minimums and steps; masked bidders; two equal bids at once; late-bid extension; closing sold and unsold; Buy It Now; editing after bids; stock; unpaid-purchase limit; share-key limits |
| `deploy-gate.test.mjs` | Netlify skips untested, failed, and not-yet-tested commits and builds passed ones |
| `sales.test.mjs` | Database: event and unlisted sales, stock, paid and cancelled sales, dashboard totals, chart, sellers, best sellers, low stock, time zone |
| `security-headers.test.mjs` | Script policy (injected and outside scripts blocked, outside connections blocked), no framing, headers, version.json, build refuses secret keys and missing config, unconfigured site explains itself |
| `storefront.test.mjs` | Browsing signed out; filters and countdowns; an item's page; sign in to bid; bids too low, OK, outbid (the page updates itself); late-bid extension; buying stock; Buy It Now; Yours; winning; dark mode; layout widths |

Each test file starts with the shop's default settings (the runner resets them). Account names get a
random suffix so reruns don't collide.
