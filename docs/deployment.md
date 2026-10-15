# Deployment

```
  you push to GitHub (main)
          │
          ├──► GitHub Actions: tests (Postgres + stand-in Supabase + Chromium phones)
          │         │ pass
          │         ▼
          │    deploy job ──POST build hook──► Netlify builds and publishes pwa/
          │
          └──► Netlify's own Git build ──► tools/netlify_ignore.py: tests passed? no → skip
                                                                  (shows "Canceled": expected)
  Phones ──HTTPS──► Netlify (the page)      Phones ──HTTPS──► Supabase (data, sign-in, photos)
```

## Pieces

| Piece | Where | Notes |
|---|---|---|
| The page | Netlify, from `pwa/` | Built by `build_pwa.py` on every deploy |
| Data, accounts, photos | Supabase | Set up once with the scripts in `supabase/` |
| Tests | GitHub Actions | `.github/workflows/tests.yml`, about 3 minutes |
| Deploy gate | `tools/netlify_ignore.py` + the workflow's deploy job | Only tested commits go live |

## Netlify

1. Push this repo to GitHub (private is fine).
2. Netlify → **Add new site → Import an existing project** → pick the repo. Netlify reads `netlify.toml`
   (build command `python3 build_pwa.py`, publish folder `pwa`).
3. **Site configuration → Environment variables**:
   - `DOWNTIME_SUPABASE_URL` = your Project URL (`https://xxxx.supabase.co`)
   - `DOWNTIME_SUPABASE_KEY` = the **publishable** key (`sb_publishable_...`)

   The build refuses secret keys, and on Netlify refuses to build without these (the last good deploy stays up).
4. **Deploys → Trigger deploy**. Optional: **Domain management** for your own domain; then update the
   Site URL and Redirect URLs in Supabase ([setup.md](setup.md#3-email)).

## Deploys wait for tests

1. Netlify → **Site configuration → Build & deploy → Build hooks → Add build hook** (branch `main`). Copy the URL.
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   `NETLIFY_BUILD_HOOK` = that URL.

After that, a push runs the tests; when they pass, the deploy job starts the Netlify build. Netlify's
own build for the push is skipped by the ignore step (it shows as *Canceled*, which is expected). If the
repo is private, the ignore step can't read GitHub without signing in, so it always skips and the
build hook does every deploy. If main moved on while tests ran, the newer commit's run deploys it.

## Keys and secrets

| Name | Lives in | Used by | If it leaked |
|---|---|---|---|
| Supabase URL + publishable key | Netlify env vars; baked into the page | Every phone | Nothing: they're public by design. Row-level security and the functions decide what they can do. |
| Supabase secret key | Supabase dashboard only | Nobody in Downtime | Full database access. Never put it in Netlify, GitHub, or `.env`. Rotate it in Supabase if exposed. |
| Database password | Your password manager | You, rarely | Full database access. Reset it in Supabase. |
| SMTP password/API key | Supabase Auth settings | Supabase, to send emails | Someone could send email as your shop. Rotate with the provider. |
| `NETLIFY_BUILD_HOOK` | GitHub Actions secret | The deploy job | Someone could trigger rebuilds of what's already on main (no code change). Delete and recreate the hook. |

`.env` (local builds) is in `.gitignore`.

## What the build does (`build_pwa.py`)
- Bakes in the Supabase URL and publishable key; refuses secret keys and plain `http://` except localhost.
- Removes the starter-data block and checks it's gone.
- Adds the manifest, icons, the service worker (cache named after the page, so updates roll out), and
  `version.json` (version, commit, branch, build time).
- Writes `pwa/_headers`: CSP with the script's SHA-256 hash, `connect-src` and `img-src` limited to the
  Supabase project, `frame-ancestors 'none'`, nosniff, no-referrer, Permissions-Policy, HSTS.

## Database scripts

| Script | Version | Rerun when |
|---|---|---|
| `1-shop.sql` | 0.4 | A release note says so (0.2 and 0.4: yes) |
| `2-photos.sql` | 0.1 | A release note says so |
| `3-schedule.sql` | 0.1 | You enabled pg_cron, or a release note says so |

`select * from dt_schema_log` (admin query 1) shows what ran when.

## Admin queries

`supabase/admin-queries.sql`; paste one at a time.

| # | Does | Changes data |
|---|---|---|
| 1 | Scripts that have run | |
| 2 | Make an account the owner | ✓ |
| 3 | Staff list | |
| 4 | Remove someone from staff | ✓ |
| 5 | Live listings | |
| 6 | Every bid on a listing, with emails | |
| 7 | Sales awaiting payment | |
| 8 | Sales and profit by month | |
| 9 | Close due auctions now | ✓ |
| 10 | Is the auction closer scheduled? | |
| 11 | Extend one auction by a day | ✓ |
| 12 | Unconfirmed sign-ups | |
| 13 | Photo storage used | |
| 14 | Orders waiting for payment, with their items | |
| 15 | Reset someone's two-step sign-in (lost phone) | ✓ |

## Decisions

1. **Online-first, not offline sync.** *Why:* bids and stock need one source of truth at one moment.
   *Trade-off:* no bidding or selling without a connection (browsing still works from the last copy).
2. **Functions only, no table access.** *Why:* every rule (reserve hidden, staff can't bid, masked names)
   lives in one place the phone can't get around. *Trade-off:* each new screen needs a function.
3. **One shop per Supabase project.** *Why:* simple, and it's your shop. *Trade-off:* selling Downtime to
   other shops later means either one project per shop or adding a shop column everywhere.
4. **Straight bids, no proxy bidding.** *Why:* easy to understand and test. *Trade-off:* bidders have to
   come back to raise; late-bid extensions keep it fair.
5. **Auctions close lazily, plus a schedule.** *Why:* correct even without pg_cron. *Trade-off:* without the
   schedule, notices wait until someone opens the shop.
6. **Payments outside the app for now.** *Why:* get selling first; checkout adds fees, refunds, and
   disputes to handle. *Trade-off:* you send payment requests by hand.
7. **Public photo bucket.** *Why:* photos load fast from a plain address and cache well. *Trade-off:* a
   draft's photos can be opened by anyone who has the exact (random) address.
8. **All rights reserved.** *Why:* keeps the option to sell the app later. *Trade-off:* the code isn't
   open for others to reuse.
