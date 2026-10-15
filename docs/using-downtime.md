# Using Downtime

## For buyers

### Shop
The home screen. Everything for sale, auctions ending soonest first, then fixed-price items newest first,
then sold items (greyed out, so you can see what the shop makes).
- **Search** looks through titles, descriptions, categories, sizes, and colors.
- **Sections**: Everything, Auctions, one per category the shop uses (Shirts, Hats, Sunglasses, Odds & ends…),
  then One-offs and Resale.
- Cards show the price, sizes and colors (like "S–XL · 3 colors"), how many are left when it's a few, and
  for auctions the current bid and a countdown that turns gold in the last hour. Signed in, your cards also
  say *You're winning*, *Outbid*, or *You got it*.

### An item
Tap a card. **Share** (top right of the item) opens your phone's share menu with the item's own link, or
copies it if your phone has no share menu. Anyone who opens the link goes straight to that item. Swipe through photos, read the description, and:

- **Fixed price**: pick a **size** and **color** when it has them (crossed-out ones are sold out), choose how
  many, then **Add to cart** or **Buy now** (just this item, right away). You confirm the total first.
- **Auction**: type your bid and tap **Bid**. The hint shows the least you can bid. The page updates every
  few seconds on its own while it's open, so you'll see if someone outbids you.
- **Buy It Now** (some auctions): ends the auction at that price, until someone bids.
- **Reserve met / not met**: the lowest price the shop will take. You never see the amount.

Bidding or buying asks you to sign in first, then brings you back to the item.

### Cart
The cart button at the top shows how many things you've added. It stays on your phone until you check out.
In the cart, change amounts with − and +, or remove things. It checks the shop each time you open it: if
something sold out or fewer are left, it tells you. **Check out** places one order for everything; if any
item sold out in the meantime, nothing is bought and the cart shows what changed. The shop then contacts you
about payment (nothing is charged in the app).

### Bidding rules
- Each bid beats the last by a step: $1 under $25, $2 under $100, $5 under $250, $10 under $1,000, then $25.
- You can't raise your own winning bid (it would only cost you more).
- A bid in the last few minutes (2 by default) pushes the end time out to that many minutes from now.
- Bids are binding: if you win, you pay what you bid.
- A big jump over the minimum asks you to confirm, in case of a typo.

### Yours
- **Notices**: outbid, won, bought, ended, paid, cancelled. A gold badge on the tab counts new ones.
- **Bids**: everything you've bid on, with your top bid and whether you're winning.
- **Bought and won**: each purchase or order ("Order of 3 items", with what's in it) and where it's at
  (Awaiting payment, Paid, Complete), with the shop's note on how to pay.

### Account
Change your name (others see it masked, like J•••n), switch dark mode, sign out, read how bidding works and
what's new. **Work for this shop?** is where a new seller types the share key.

## For staff

Staff get **Shop, Listings, Sales, Dashboard, Account** (the owner also gets **Admin**). Staff can't bid or
buy; they log sales instead.

### Two-step sign-in (required for staff)
The first time a staff account signs in (or right after joining with the share key), Downtime asks you to
set up an authenticator app: install Google Authenticator, Microsoft Authenticator, or 1Password, tap
**Add to authenticator app** (or scan the QR code, or type the key), then type the 6-digit code. After that,
signing in on a new phone asks for the current code. Until it's done, only Shop and Account show, with a
banner and a button to finish. If you lose the phone with the app, see [troubleshooting](troubleshooting.md).

### Listings
**Live, Drafts, Ended.** Tap **New listing**:

- **Photos**: up to 8. **Take photo** opens your camera; **Choose photos** picks from your gallery (several at once). The first is the cover. They're shrunk on your phone (longest side 1600 px) and
  uploaded straight away; tap Save or Publish to keep them on the listing.
- **Title, description, what kind of item** (custom, one-off, resale), **category** (suggests ones you've used).
- **Fixed price**: price and how many. Or, for things like shirts and hats, type **Sizes** (like
  `S, M, L, XL`) and/or **Colors** (like `Black, Sand`): a stock box appears for every combination. Counts you
  typed are kept if you add a size or color later. Up to 10 sizes and 6 colors.
- **Auction**: starting bid, optional reserve, optional Buy It Now (must be more than both), and when
  bidding ends (default a week out at 8 pm; at least 10 minutes and at most 30 days away).
- **Category**: suggests Shirts, Hats, Sunglasses, Odds & ends, and any you've used. Each category becomes a
  section in the shop.
- **Your cost** (optional, staff only): used for profit on the dashboard.

**Save draft** keeps it private; **Publish** puts it in the shop. On a live listing: **Save changes** or
**Take down** (back to drafts). Once an auction has bids, only the wording, category, and photos can change,
and it can't be taken down. A **sold-out** fixed-price item opens ready to restock: add stock and **Save
changes** to put it back on sale. Sold auctions and unsold listings offer **Relist as a new draft** (sizes
and colors come along, with stock set to 0). Drafts that never sold can be deleted.

### Sales
Your latest notices sit at the top (new online sales, auctions that ended without a sale). Filters:
**All, Awaiting payment, Paid, Complete, Cancelled**. A cart checkout shows as one **order** with its items
listed. Tap a sale or order to see the buyer and move it along (an order moves as a whole):

- **Mark paid** (tells the buyer), then **Mark complete** once it's handed over or shipped.
- **Cancel sale**: fixed-price items go back in stock (the right size and color); auctions go to *No sale*
  so you can relist.

**Log a sale** for things sold in person or at events. Pick a listed item (it comes out of stock and the
total fills in; pick the size or color if it has them) or type a name for something unlisted. Add where (in person, event + its name, other), the
buyer, whether it's paid, your cost, and a note.

### Dashboard
Choose **7 days, 30 days, or 90 days**.
- **Today, Last 7 days, Last 30 days, Awaiting payment** (gold when anything is waiting).
- **Sales per day**: one bar a day, today in gold. On a computer, point at a bar to see its total. The line above it shows
  the period's total, items, and profit where costs are known.
- **By seller**: each staff member's logged sales, plus *Online store* for everything bought in the shop.
- **Best sellers**: top 5 by revenue.
- **Stock**: counts, items and sizes/colors at or below the low-stock level (tap to edit), and recent sell-outs.
- **Auctions ending soon**: the next 2 days.

Cancelled sales never count. "Today" follows the shop's time zone.

### Admin (owner)
- **Owed to you**, **Not invoiced yet**, **Overdue** (older than the days you set; gold and red when there's
  something to do), and the number of **Accounts**.
- **Waiting for payment**: every unpaid order, oldest first, with the buyer, what's in it, how old it is,
  and whether it's invoiced or reminded. Tap one to act on it.
- **Customers**: search by name or email. Each shows orders, what they've spent, and what they owe.
  Tap one for their orders and recent bids, and to **Block from buying and bidding** (with a note) or **Unblock**.

### Getting paid (any staff)
On an unpaid sale or order: send the buyer a payment request (PayPal, Venmo…) for the total, then tap
**Mark invoiced** (the buyer is told it's on its way). If they're slow, **Send reminder** (once a day at
most). When the money arrives, **Mark paid**. Sales labels each unpaid one *Not invoiced*, *Invoiced*, or *Overdue*.

### Account → Shop settings (owner)
Shop name, tagline, About (top of the shop), how buyers pay (sent with every "you won / you got it" notice),
contact email, how many minutes a late bid adds (1 to 30), the low-stock level, after how many days an
unpaid order counts as overdue (1 to 60), and the time zone.
Below that: the staff list (remove sellers) and the **share key** with **Copy key** and **New key**.
Sellers can read the settings but not change them.
