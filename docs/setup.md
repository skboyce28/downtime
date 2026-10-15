# Setup

About 20 minutes, most of it waiting for Supabase. You need a free Supabase account, a GitHub account,
and a Netlify account.

## 1. Supabase project

1. supabase.com → **New project**. Pick a region near your buyers and save the database password somewhere safe.
2. **Project Settings → API**: note the **Project URL** and the **publishable** key (`sb_publishable_...`).
   Never use the secret key (`sb_secret_...` or `service_role`) anywhere in Downtime.

## 2. Run the scripts, in order

**SQL Editor → New query**, paste each file, press **Run**. All of them are safe to run again.

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/1-shop.sql` | Tables, bidding and buying rules, the back office, the dashboard |
| 2 | `supabase/2-photos.sql` | The `listing-photos` bucket; only staff can upload |
| 3 | `supabase/3-schedule.sql` | Closes auctions on the minute. First enable **Database → Extensions → pg_cron**. Optional: without it, auctions close the next time anyone opens the shop. |

When a new version changes the database, its changelog entry says which script to rerun.

## 3. Email

Buyers confirm their email before they can sign in, and forgotten passwords use an emailed link.

1. **Authentication → Sign In / Providers → Email**: keep **Enable sign-ups** and **Confirm email** on.
   Minimum password length: 8.
2. **Authentication → URL Configuration**: set **Site URL** to your Netlify address
   (for example `https://downtime-shop.netlify.app`), and add the same address under **Redirect URLs**.
3. **Custom SMTP (needed before real buyers sign up).** Supabase's built-in email only delivers to
   members of your Supabase team, and only 2 messages an hour. Set up a sender under
   **Authentication → Emails → SMTP Settings** with a provider such as Resend, Postmark, Brevo, or AWS SES,
   using an address on a domain you own (for example `hello@yourdomain.com`).
4. Optional: **Authentication → Emails → Templates** to word the confirmation email in your brand's voice.

### Two-step sign-in
Staff accounts must use an authenticator app. Supabase has this on by default; check
**Authentication → Sign In / Providers → Multi-Factor** (or **Authentication → MFA**) and make sure
**TOTP (App Authenticator)** is enabled.

## 4. Host it

See [deployment.md](deployment.md): GitHub repo → Netlify site with `DOWNTIME_SUPABASE_URL` and
`DOWNTIME_SUPABASE_KEY` → the build hook for tested deploys.

## 5. Become the owner

1. Open the shop, tap **Sign in → Create account**, confirm your email, and sign in.
2. In the SQL Editor run (with your email):
   ```sql
   select public.dt_make_owner('you@example.com');
   ```
3. Reopen the app. It asks you to set up two-step sign-in: install an authenticator app, tap **Add to
   authenticator app**, and type the code. Then the Listings, Sales, Dashboard, Admin, and Account tabs appear. In **Account → Shop settings**,
   fill in the About text, how buyers pay, and your contact email.

Tip: use one account for running the shop and a different one if you ever want to shop it yourself.
Staff accounts can't bid.

## 6. Install on your phone

Open the site in Chrome on Android → menu → **Add to Home screen** (on iPhone: Safari → Share →
**Add to Home Screen**). It opens full screen and keeps working offline for browsing what it last saw.

## Local builds

Copy `.env.example` to `.env` (git ignores it), fill in the URL and publishable key, then
`python3 build_pwa.py`. The result is in `pwa/`.
