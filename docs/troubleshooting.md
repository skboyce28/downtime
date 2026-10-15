# Troubleshooting

**The shop says "isn't connected to its database yet."**
The build had no Supabase settings. Netlify → Environment variables: set `DOWNTIME_SUPABASE_URL` and
`DOWNTIME_SUPABASE_KEY`, then **Deploys → Trigger deploy**.

**Netlify build fails: "is a SECRET key."**
You pasted the secret key. Use the publishable one (`sb_publishable_...`) from Project Settings → API.

**Every Netlify build shows "Canceled."**
Expected for builds Netlify starts on its own: the deploy gate skips them, and the tests' build hook does
the real deploy. If nothing ever deploys, check the `NETLIFY_BUILD_HOOK` secret in GitHub and the latest
Actions run (a warning says when the hook isn't set).

**People never get the confirmation email.**
Supabase's built-in email only reaches your own team, 2 an hour. Set up custom SMTP
([setup.md](setup.md#3-email)). Also check spam, and admin query 12 for unconfirmed sign-ups.

**The confirmation link opens the wrong site or localhost.**
Supabase → Authentication → URL Configuration: Site URL and Redirect URLs must be your Netlify (or own) address.

**"Confirm your email first" after clicking the link.**
The link may have expired or already been used. Sign up again with the
same email to get a new link.

**A staff member lost the phone with their authenticator app.**
In the SQL Editor (with their email):
```sql
delete from auth.mfa_factors where user_id = (select id from auth.users where lower(email) = lower('them@example.com'));
```
They sign in with their password and set up a new app. (Admin query 15.)

**"That code didn't match."**
Use the newest code in the app, and make sure the phone's clock is set automatically.

**Signed in, but no back office tabs.**
The account isn't on staff. Owner: admin query 2. Seller: Account → Work for this shop? with the share key.
"This account has bid on shop items" means use a different account for selling.

**"Too many wrong keys."**
10 wrong share keys in an hour. Wait an hour, and check the key with the owner (it may have been replaced).

**An auction is past its end but still shows live.**
Opening the shop or the listing closes it. If the winner's notice is slow, set up `3-schedule.sql`
(admin query 10 checks it).

**Photo upload fails.**
"You don't have access" means the account isn't staff, or `2-photos.sql` wasn't run. Very large or unusual
photos are shrunk to JPEG first; if one still fails, try a screenshot of it.

**Something disappeared from a buyer's cart, or checkout said it sold out.**
The cart checks the shop each time it opens. If someone else bought the last one first, the cart says so and
nothing in that order is charged or reserved. Restock the item (open it, add stock, save) and it shows again.

**A buyer won but won't pay.**
Sales → the sale → **Cancel sale**. The auction goes to *No sale*; open it and **Relist as a new draft**.

**The app on my phone looks out of date.**
Close it completely and reopen; the new version loads on the next start. Account → About shows the version.
