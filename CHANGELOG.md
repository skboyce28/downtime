# Changelog

Newest first. Database changes say which script to rerun.

## 0.5 · October 15, 2026

No database changes.

- **Plain downtime. logo**, the same as the shirts: lowercase with a period, in Poppins Bold (served with
  the site, only the letters it needs). The app icon is now a plain **d.**
- **Shopper view** for staff: **Account → View as a shopper** shows the shop exactly as customers see it
  (their tabs, the cart, Add to cart and Bid), with staff details hidden and a banner to switch back. It's a
  preview: staff accounts still can't buy or bid, so checkout explains that instead.

## 0.4 · October 15, 2026

Database: rerun `1-shop.sql`. **Your staff share key changes** to a new, longer one (see Account → Shop
settings). After the update, the owner and sellers set up two-step sign-in the next time they open the app.

- **Admin tab** (owner only): what you're owed, how much still needs a payment request, overdue orders
  (older than a number of days you choose, 3 by default), and every account with what they've bought,
  paid, and still owe. Search customers and open one to see their orders and bids.
- **Invoiced step**: mark an order *invoiced* once you've sent the payment request; the buyer gets a notice.
  **Send reminder** nudges the buyer in the app (once a day at most). Sales shows Not invoiced, Invoiced, or Overdue.
- **Block a buyer** from buying and bidding (with a note for yourself). They can still browse and see a
  banner explaining. Unblock any time.
- **Two-step sign-in is required for shop staff**: an authenticator app code as well as the password.
  Until it's done, the back office, photo uploads, Admin, and shop settings stay locked, and the database
  enforces it, not just the app.
- **Longer share key**: 16 characters (like `K7QM-4XPD-R9TW-2HBN`) from a strong random source.
- **Item links**: every item has its own link, and **Share** on an item opens your phone's share menu
  (or copies the link). Opening the link goes straight to the item.

## 0.3 · October 15, 2026

No database changes.

- **Take a photo or choose from your gallery** when adding listing photos. **Take photo** opens the back
  camera right in the editor; **Choose photos** picks one or several from your gallery.

## 0.2 · October 15, 2026

More like a store. Database: rerun `1-shop.sql` (safe on an existing shop; nothing is lost).

- **Sizes and colors** on one listing: type the sizes and colors, then the stock for each combination.
  Buyers pick before buying; sold-out combinations are crossed out. The dashboard's low stock names the size.
- **Cart**: add several things and check out once. It's one order with one payment to collect, and it's all
  or nothing: if something sold out meanwhile, nothing is bought and the cart shows what changed.
- **Shop sections and search**: sections come from your categories (Shirts, Hats, Sunglasses, Odds & ends,
  or anything you use), plus One-offs and Resale. Search looks at titles, descriptions, sizes, and colors.
- **Sold-out items stay on show**, greyed out at the end of their section, instead of a separate shelf.
- **Restocking**: open a sold-out item, add stock, and save to put it back on sale.
- **Orders in Sales and Yours** show as one line ("Order of 3 items"); paying or cancelling moves the whole order.
- Logging an event sale asks which size or color sold.
- Fixed: opening the sign-in sheet could move the cursor to the email box while you were already typing.
- Fixed: on small phones a long name pushed the cart off screen, and the Sign in button could slip under the cart.

## 0.1 · October 14, 2026

The first version of Downtime. Database: run `1-shop.sql`, `2-photos.sql`, and (optional) `3-schedule.sql`.

- **Storefront** anyone can browse: photos, prices, countdowns, filters, and Recently sold.
- **Accounts** with a confirmed email, password reset by email, and masked names next to bids.
- **Auctions** with a starting bid, optional reserve and Buy It Now, set bid steps, and late bids that add time.
- **Fixed-price items** with stock; buy one or several.
- **Notices** for outbid, won, bought, ended, paid, and cancelled, with a badge.
- **Back office**: listings with up to 8 photos, drafts, publish, take down, relist; a sales log for
  in-person and event sales; marking sales paid, complete, or cancelled.
- **Dashboard**: today, 7 and 30 days, awaiting payment, sales per day, by seller, best sellers, stock,
  auctions ending soon, and profit where costs are known.
- **Staff**: an owner and sellers who join with a share key; staff can't bid.
- **Hosting**: installable on phones, works offline for browsing, strict security headers, and deploys
  only after tests pass.
