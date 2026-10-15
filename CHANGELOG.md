# Changelog

Newest first. Database changes say which script to rerun.

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
