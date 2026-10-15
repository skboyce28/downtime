# Changelog

Newest first. Database changes say which script to rerun.

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
