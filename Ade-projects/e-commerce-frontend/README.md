# Duka — Marketplace Frontend

A complete React + TypeScript + Tailwind storefront for the `ecommerce`
NestJS backend, styled as a general "order anything" marketplace (Jumia-
style) rather than a single-category shop: JWT + Google OAuth,
products/brands/variants across categories, cart, checkout, Paystack card
payments + bank transfer, order tracking, a customer dashboard/profile, and
a full admin back office.

## Full code review pass (this round)

Went through both this frontend and the backend looking for real bugs
before devops work starts. 16 issues found — 15 were backend-only (wrong
route params, undecorated DTOs silently rejecting entire requests,
mismatched field names, two password-hashing gaps, and more) — full
writeup in `CODE-REVIEW-FINDINGS.md` in the backend project.

**One change landed here**, paired with a backend fix: admin product
creation was failing validation because `CreateProductDto.category` is
required, but this form never had a category field. Rather than weaken a
real business field just to silence the error, added a proper category
dropdown — `AdminAddProduct.tsx` now fetches from the backend's actual
`GET /categories` endpoint (new `src/api/categories.ts`) and sends the
selected category on submit. That endpoint turned out to be fully real and
working; earlier work on this project had assumed it didn't exist.

## Notifications

In-app notifications, polling-based rather than WebSocket-driven — no
push/socket infra existed on the backend, and polling `GET
/notifications/unread-count` every 30s is simple and good enough for a
dashboard context. `NotificationBell.tsx` in the navbar (next to Cart,
only rendered when logged in) shows an unread badge and a dropdown list;
clicking a notification marks it read and navigates to its `link`.

Fourteen event types fire from the backend automatically. The original
eight, order/payment-related: order placed (customer) / new order (all
admins), order status changed (customer), payment received via card or
approved bank transfer (customer), payment refunded (customer), bank
transfer submitted (all admins), bank transfer rejected (customer), and
low stock after checkout (all admins).

Six more, account-lifecycle related (added this round, in
`AuthService`/`UsersService`):
- **Signup** → welcome notification to the new user (`AuthService.signup()`)
- **Login** → "new sign-in" notification (`AuthService.login()`)
- **Logout** → "signed out" notification, visible on their next login since
  they obviously can't see it mid-logout (`AuthService.logout()`)
- **Admin profile created** → the new admin gets a welcome notification
  (no password in it — that's returned once in the API response only,
  never stored in a notification doc); every *other* existing admin gets
  a separate "new admin added" notification
  (`UsersService.createAdminProfile()`)
- **Customer profile updated** → confirmation notification to that user
  (`UsersService.updateCustomerProfile()`)
- **Account deactivated** → notification to the affected user
  (`UsersService.deactivateUser()`)

One design note on the admin-creation pair: `NotificationsService.notifyAdmins()`
gained an optional `excludeUserId` param specifically for this — without
it, querying "all admins" after the new admin is already saved would
include them in their own "a new admin was added" broadcast, on top of
their separate welcome notification. Excluded them from the broadcast
instead of letting that duplicate through.

**Three real backend bugs found and fixed while wiring up the original
eight** — none of
them were about notifications directly, but each one blocked something
notifications needed to work correctly:

1. **`OrdersService.create()` silently dropped every cart item past the
   first one.** Order creation, `cartService.clearCart()`, and the
   `return` statement were all inside the cart-items loop — for any cart
   with 2+ different items, the order got created after the first
   iteration with just that one item, the whole cart got cleared anyway,
   and the function returned. Every other item was gone, not left in the
   cart, just lost. Moved order creation below the loop so all items are
   collected first.
2. **Stock was never actually decremented on checkout.**
   `VariantsService.decreaseStock()` existed but nothing called it from
   the order-creation path. Added it — one call per order item, right
   after the order is created, which is also what makes a real low-stock
   notification possible.
3. **`UpdateOrderDto` had no `status` field**, since it extended
   `PartialType(CreateOrderDto)` and `CreateOrderDto` only has
   shipping-address fields. Combined with the global `ValidationPipe`'s
   `forbidNonWhitelisted: true`, any `status` sent to `PUT
   /orders/:orderId` was silently stripped before it ever reached the
   controller — admins could never actually change an order's status
   through that endpoint, regardless of what the admin UI sent. Given its
   own DTO with `status?: OrderStatus`. `paymentStatus` deliberately isn't
   on it — that should only change via the payment flows (webhook, bank
   transfer approval, refund), not be hand-editable here.

Also reapplied the two analytics fixes from an earlier round (duplicate
`/analytics/products` route, wrong-case `populate()`) — a prior rename on
your end restored the original unfixed content instead of the patched
version, so those bugs were back until this pass.

## Design direction

Originally built with a niche freight/shipping-manifest visual theme, then
rebranded into a general "order anything" marketplace once you asked for
that. This round aligned it further against a screenshot of your actual
Figma frames (the file itself still isn't link-shareable, so this is from
the screenshot, not a live pull):

- **Palette retuned to royal blue / near-black navy** (was orange from the
  first rebrand pass) — same `rust`/`steel` token names in
  `tailwind.config.js`, new values, so it cascades everywhere without
  touching most page files.
- **Admin (`/admin`) rebuilt as a dark navy sidebar dashboard** —
  `AdminLayout.tsx` now renders a fixed dark sidebar with icon nav, matching
  the dashboard frames in your screenshot, instead of the earlier light
  in-page tab list.
- **Login/Signup rebuilt as split-screen layouts** (`AuthSidePanel.tsx` +
  updated `Login.tsx`/`Signup.tsx`) — a dark gradient/pattern panel on one
  side, the form on the other, matching your sign-in/sign-up frames.
- **Product detail page** gained a breadcrumb strip and a real "You Might
  Also Like" section (`ProductDetail.tsx`) — related products are pulled
  from the same brand via the actual `GET /products?brand=` endpoint, not
  fabricated.
- **On photography:** your frames use real lifestyle/product photos for the
  hero and auth panels. I didn't hotlink scraped stock images into the
  shipped code — that breaks easily and raises licensing questions for
  something you'll actually deploy. `AuthSidePanel.tsx` and the homepage
  hero use a designed gradient/pattern instead; swap in your own product
  photography there (a plain `<img>` in place of the gradient `<div>` works
  the same way) whenever you have real assets.

The shared component classes (`.ticket`, `.btn-primary`, `.stamp`,
`.label-eyebrow`, etc. in `src/styles/index.css`) are still the mechanism
that keeps every page consistent — most pages didn't need direct edits for
this pass, only the ones with real structural differences (admin, auth,
product detail) did.

**Category browsing note:** the backend has no dedicated `/categories`
endpoint, only `Product.category` (a populated reference). The category
strip on the homepage is derived client-side from a sample of real
products rather than a fabricated list, and filters using the actual
`category` ID the backend's `GET /products` endpoint accepts — not a
free-text hack. If you add a proper categories endpoint later, swap
`Home.tsx`'s sampling logic for a real `listCategories()` call.

## Full dashboard set (this round)

Your later screenshots showed a much fuller "DEAL+RT"-style admin — separate
Dashboard/Order Management/Customers/Categories/Transactions sections with
charts, plus a dedicated storefront Shop page and a richer footer. Here's
what got built, and how each maps to what the backend actually supports:

- **Admin sidebar relabeled** to match your nav vocabulary: Dashboard,
  Order Management, Customers, Categories, Transactions, Product List, Add
  Product, Brands — same underlying data/endpoints as before. Product List
  and Add Product were originally one combined page; split into
  `AdminProductList.tsx` (`/admin/products`) and `AdminAddProduct.tsx`
  (`/admin/products/new`) to match your mockup's separate nav items — the
  list page has a "+ Add Product" button linking to the add page, and
  successful creation redirects back to the list.
- **Dashboard gained a real revenue chart** (`AdminOverview.tsx`, using
  `recharts`, added to `package.json`) — a 14-day trend built from actual
  `order.createdAt`/`total` on paid orders. No analytics endpoint exists on
  the backend, so this is computed client-side from `GET /orders` rather
  than faked.
- **New Categories admin page** (`AdminCategories.tsx`, `/admin/categories`)
  — there's no `/categories` controller on the backend (only
  `Product.category` as a populated reference), so this is a real
  breakdown — product counts per category, derived from a product sample —
  rather than a CRUD screen against an endpoint that doesn't exist. Each
  category links to the new Shop page filtered to it.
- **New public Shop page** (`Shop.tsx`, `/shop`) — a dedicated catalog with
  a sidebar of category/brand filters, separate from the homepage's lighter
  "New Arrivals" showcase. Filters are single-select radios, not
  checkboxes — `GET /products` only accepts one `category`/`brand` ID at a
  time, so multi-select checkboxes would silently not work as expected;
  this doesn't pretend otherwise.
- **"My Profile" added to the admin sidebar** — your mockup has separate
  admin Profile/Settings frames; those map to the customer `Profile.tsx`
  page that already existed (same account, same `GET /users/profile` /
  `PATCH /users/update-customer-profile` endpoints), so this links there
  rather than duplicating a second profile page. One thing I didn't build:
  a "change password while logged in" form — the backend only has the
  email-link `forgot-password`/`reset-password` flow, no endpoint that
  takes an old password + new password directly, so a change-password form
  on this page would have nowhere real to submit to.
- **Footer expanded** with real navigable link columns (Shop, Cart,
  Dashboard, Orders, Payments). Your mockup's footer also has Contact
  Info/Opening Hours — those aren't in here, since I'd be inventing a phone
  number and hours that don't exist rather than reflecting anything real.

## Setup

```bash
npm install
cp .env.example .env   # set VITE_API_URL to your backend, e.g. http://localhost:4000
npm run dev
```

## Structure

```
src/
  api/         one file per backend resource — auth, users, products,
               variants, brands, cart, orders, payments — plus client.ts
               (axios instance, JWT header injection, refresh-token retry)
  context/     AuthContext (current user + token handling),
               CartContext (server-synced cart)
  components/  Navbar, Footer, ProductCard, VariantPicker, GoogleButton,
               ProtectedRoute (with adminOnly gate)
  pages/       Home (catalog), ProductDetail, Cart, Checkout, Login, Signup,
               AuthCallback (Google OAuth), Dashboard, Profile, Orders,
               OrderDetail, PayOrder, Payments, PaymentReturn
  pages/admin/ AdminLayout (sidebar), AdminOverview, AdminProductList,
               AdminAddProduct (+ VariantManager), AdminBrands,
               AdminCategories, AdminOrders, AdminPayments, AdminUsers
  types/       TS interfaces mirroring the Mongoose schemas
```

## Feature coverage

- **Auth** — email/password signup+login, JWT access token with automatic
  refresh-token retry on 401, session restore via `/auth/me`.
- **Google OAuth** — "Continue with Google" does a full-page redirect to
  `${API_URL}/auth/google`. See the callout below for the one backend piece
  still needed to close the loop.
- **Catalog** — search, brand filter, sort, pagination, variant picker
  (size/color/etc. derived from the product's variants), stock-aware
  add-to-cart.
- **Cart & checkout** — server-synced cart, shipping address form, order
  creation.
- **Payments** — Paystack card checkout (redirect to hosted page, polling
  return page to confirm status) and bank transfer (reference + receipt
  upload + receipt link for manual approval — see note below).
- **Customer dashboard** — stats (orders, spend, pending payments), quick
  links, recent orders; a profile page for editing contact info and avatar.
- **Admin back office** (`/admin`, `ADMIN` role only) — overview stats,
  product CRUD + per-product variant management (attributes, stock,
  images), brand CRUD, order status management, payment review (approve
  bank transfers, issue refunds), and a user list with deactivation.

## Backend fixes applied this round

I don't have a tool that edits an existing Drive file in place — only one
that creates new files — so each fix below was uploaded as a sibling file
next to the original for you to review and copy in. All are complete
files, not diffs.

### 1. Product images were never resolved to loadable URLs — `product.service.ts` → `product.service.updated.ts` (same folder)

I read `aws.file-upload.ts` directly: `uploadFile()` returns only the raw
S3 **key** (e.g. `products/1699...-shoe.jpg`), never a full URL — turning
that key into something a browser can load requires `getDownloadUrl(key)`,
which generates a signed URL. `AuthService` already does this for profile
images (`resolveProfileImage()`), but `ProductsService.findAll()` /
`findById()` returned the raw keys straight from Mongo, unresolved. Every
`<img>` tag pointed at a product image was therefore broken — not a
frontend bug, the API was handing back an unusable string. Fixed by adding
a `resolveProductImages()` helper (mirroring the existing profile-image
pattern) and applying it in both `findAll()` and `findById()`.

### 2. Variant images were uploaded to S3 and then silently discarded — `product-variant.service.ts` → `product-variant.service.updated.ts` (same folder)

This one's worse than #1 — I read `VariantsService.create()` directly:
it uploads each image to S3 and builds an `uploadedImages` array, but then
calls `this.variantModel.create({ ...dto, sku: ... })` **without ever
including `images: uploadedImages`** in that call. The upload succeeds,
the file sits in your S3 bucket, and the variant document is saved with no
`images` field at all — gone. Fixed by adding `images: uploadedImages` to
the `create()` call, plus the same `getDownloadUrl()` resolution as #4 for
`findByProduct()`/`findById()`. One thing worth knowing if you review the
diff: `updateStock()`, `remove()`, and `decreaseStock()` were changed to
call `this.variantModel.findById()` directly instead of the service's own
`findById()` — the service's `findById()` now returns a resolved plain
object (post-`getDownloadUrl()`), which doesn't have `.save()` on it. Using
the resolving version there would have broken every stock update silently.

### 3. Payment receipts had the same unresolved-URL bug, plus a wrong status check on the frontend — `payment.service.ts` → `payment.service.updated.ts` (same folder)

Fourth instance of the same backend pattern: `confirmBankTransfer()` stores
the uploaded receipt as a raw S3 key on `payment.receipt`, but
`findMyPayment()`, `findPayment()`, `verifyAllPayments()`,
`getMyPayments()`, and `getPendingTransfers()` all returned it unresolved.
Fixed with the same `resolveReceipt()` pattern as #1–#3.

There was also a real bug on **this frontend's** side, not the backend's:
`AdminOverview.tsx` and `AdminPayments.tsx` checked
`payment.status === 'PENDING'` to decide when to show the "Approve"
button and the pending-transfers count. But `confirmBankTransfer()` sets
the status to `AWAITING_CONFIRMATION`, not `PENDING` — `PENDING` only
describes a transfer that's been initialized but not yet confirmed by the
customer. That meant the Approve button could never appear for any
transfer actually ready for review. Fixed both files, added
`AWAITING_CONFIRMATION` to the `Payment` type's status union (it was
missing entirely), added `receipt`/`receiptUrl` to that type, and added a
"View Receipt" link in `AdminPayments.tsx` so admin can actually see what
they're approving. (`PaymentReturn.tsx`'s `PENDING` checks were already
correct and untouched — that page is the Paystack card flow, which
legitimately stays `PENDING` until webhook/verify, and never touches
`AWAITING_CONFIRMATION` at all.)

### 4. Brand logos had the same unresolved-URL bug — `brand.service.ts` → `brand.service.updated.ts` (same folder)

Same root cause as #1, confirmed by reading `BrandsService` directly:
`create()` stores `logo` as a raw S3 key via `uploadFile()`, but
`findAll()`/`findById()` returned it unresolved — any `<img src={brand.logo}>`
on the frontend was broken the same way product images were. I also
checked `AuthService` and `UsersService` for the same bug (both use
`fileUpload.uploadFile()` for profile images) and confirmed those two are
already correct — `resolveProfileImage()` is already called everywhere
they return a user, so no fix was needed there. Fixed `BrandsService` with
the same `resolveBrandLogo()` pattern as the other two.

### 5. Email links (verify + reset password) — frontend pages added, one backend env var needed

I read `AuthService.signup()` and `forgotPassword()` directly. Both build
an emailed link from a `BASE_URL` config value:
- Signup: `${BASE_URL}/auth/verify-email/:id/:token`
- Forgot password: `${BASE_URL}/reset-password/:id/:token`

Neither of these link shapes matches the backend's own controller routes
directly as a page a browser can land on and *see* something (the
signup one doesn't even textually match the controller's route name —
`verify-email` vs the controller's `email-verify` — and the reset-password
one is a `POST` endpoint, which a clicked link can never hit on its own).
That strongly suggests `BASE_URL` is meant to be **this frontend's origin**,
not the backend's own — the same role `FRONTEND_URL` plays for Google
OAuth. Built three new frontend pages to match:
- `src/pages/EmailVerify.tsx` at `/auth/verify-email/:id/:token` — calls
  the backend's actual `GET /auth/email-verify/:id/:token` on load, shows
  success/failure.
- `src/pages/ResetPassword.tsx` at `/reset-password/:id/:token` — a form
  that `POST`s to the backend's real `/auth/reset-password/:id/:token`.
- `src/pages/ForgotPassword.tsx` at `/forgot-password` — a request form
  wired to `forgotPassword()` in `src/api/auth.ts`, which already existed
  but was never called from any page. Linked from `Login.tsx`.

**What you need to do on the backend:** set `BASE_URL` in `.env` to this
frontend's origin (e.g. `http://localhost:5173` — can be the same value as
`FRONTEND_URL`). No code change needed for this one, just the env var —
the controller routes themselves are already correct; it was only the
*emailed link text* that needed a same-origin frontend page to land on.

### 6. CORS — `main.ts` → `main.updated.ts` (same `src` folder)

Without this, **nothing** from this frontend can reach the backend — not
just Google login. Added:

```ts
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
});
```

Add `FRONTEND_URL=http://localhost:5173` (or wherever this app actually
runs) to the backend's `.env`.

### 7. Refresh-token bug — `auth.service.ts` → `auth.service.updated.ts` (same `auth` folder)

`refreshToken()` was calling `this.userModel.findById(payload)`, passing
the whole decoded JWT payload object instead of its `sub` field. That meant
every refresh attempt — for password logins as much as Google ones — would
fail to find the user. Fixed to `this.userModel.findById(payload.sub)`.
This is the only line changed from your original file.

### 8. Google OAuth redirect — still outstanding

`auth.controller.ts`'s `google/callback` handler still returns the tokens
as a **JSON body on the backend's own URL** instead of redirecting to this
app:

```ts
@Get('google/callback')
@UseGuards(GoogleAuthGuard)
googleCallback(@Req() req: any) {
  return this.authService.googleLogin(req.user);
}
```

I already dropped a complete replacement at `auth.controller.updated.ts`
(same `auth` folder) with the fix:

```ts
@Get('google/callback')
@UseGuards(GoogleAuthGuard)
async googleCallback(@Req() req: any, @Res() res: Response) {
  const { accessToken, refreshToken } = await this.authService.googleLogin(req.user);
  const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
  res.redirect(`${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
}
```

That file also adds the `Res`/`Response`/`ConfigService` imports and
constructor injection the handler needs — copy the whole file over, not
just this method. `src/pages/AuthCallback.tsx` here is already built to
read both tokens off the query string once this lands.

## Wiring up Paystack

- Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_CALLBACK_URL` in the backend's
  `.env`, plus `BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` for
  the bank-transfer flow (I found these read via `configService.get()` in
  `initializeBankTransfer()`).
- `src/pages/PaymentReturn.tsx` polls `GET /payments/my-payments` after
  Paystack redirects back, since actual confirmation happens server-side
  via Paystack's webhook (`POST /payments/webhook`), not on this page.
- **Bank transfer confirm needs two separate things, not one.** I read
  `payment.service.ts` directly: `confirmBankTransfer()` sets
  `payment.receipt` from the uploaded file (via multer → S3), but
  separately sets `payment.receiptUrl = dto.receiptUrl` straight from the
  request body — unconditionally, with no fallback to the uploaded file's
  resulting URL. The two fields aren't reconciled on the backend. This
  frontend now sends both: the uploaded file *and* a `receiptUrl` text
  field the customer fills in (`PayOrder.tsx`). Worth deciding on your end
  whether `ConfirmBankTransferDto.receiptUrl` should actually be optional,
  or whether `confirmBankTransfer()` should derive it from the uploaded
  file instead of requiring the client to supply a separate link.
- `initializeBankTransfer(orderId)` — confirmed correct against
  `payment.service.ts` directly, only needs `orderId`.

## Other assumptions from reading the backend

- `POST /auth/refresh` accepts `{ refreshToken }` and returns
  `{ accessToken }` only (no refresh-token rotation) — confirmed directly
  against `auth.service.ts`. `src/api/client.ts` already handles this: it
  only overwrites the stored refresh token if the response includes one.
- The `reviews` module only had a schema folder with no controller in your
  Drive, so no review UI was built.
- `GET /payments` (admin) — confirmed directly against `payment.service.ts`:
  `verifyAllPayments()` returns a plain array of payments, populated with
  `user` and `order`. Matches what `AdminPayments.tsx` expects.

## Not verified

**Backend**: fully verified this round — `node_modules` was present in
your upload, so `npm run build` (`nest build`) was actually run against
every change, including the notifications feature and all three bug
fixes. It compiles clean, zero errors.

**This frontend**: still not verified — no `node_modules` in this upload
and no network access in this sandbox to `npm install`. Every import
across the project was checked programmatically and all resolve
correctly, but that's static analysis, not a real `tsc`/`vite build`. Run
`npm install && npm run build` locally as the first real check.
