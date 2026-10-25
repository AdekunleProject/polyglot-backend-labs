# Code Review Findings

Full pass through both the backend and frontend before devops work, per
request. Every fix below was verified with an actual `nest build` (this
upload had `node_modules`) — zero compile errors. The frontend had no
`node_modules`, so it's import-checked (every relative import resolves)
but not build-verified; run `npm install && npm run build` there yourself.

16 real issues found and fixed, grouped by how bad they were.

## Critical — completely broke a feature end-to-end

These weren't edge cases; each one meant the feature **never worked at
all**, for anyone, under any conditions.

1. **Every "view product" request was broken.**
   `product.controller.ts`: the route was `@Get(':id')` but the handler
   read `@Param('productId')`. Since those names didn't match, Nest's
   `@Param()` always returned `undefined` — `findById(undefined)` ran on
   every single request. Fixed by renaming the route param to match.

2. **Token refresh has never worked — meaning every user gets logged out
   the moment their 15-minute access token expires.**
   `refresh-token.dto.ts` had zero validation decorators. With the global
   `ValidationPipe`'s `whitelist: true` + `forbidNonWhitelisted: true`, an
   undecorated property isn't recognized as a real DTO field, so
   `POST /auth/refresh` was rejected outright — "property refreshToken
   should not exist" — before ever reaching the controller.

3. **Bank transfer could never be initiated.**
   `initialize-bank-transfer.dto.ts` — same missing-decorator issue.
   `POST /payments/bank-transfer` was rejected outright.

4. **Bank transfer could never be confirmed**, even if #3 were fixed
   separately. `confirm-bank-transfer.dto.ts` — same issue.
   `POST /payments/bank-transfer/confirm` was rejected outright. Between
   #3 and #4, this store's entire non-card payment method has been
   completely non-functional.

5. **Every checkout request failed.** The frontend has always sent
   `shippingAddress` as a structured object (`fullName`, `line1`, `line2`,
   `city`, `state`, `postalCode`, `country`, `phoneNumber`) — it's what the
   order confirmation and admin order views display. But
   `CreateOrderDto.shippingAddress` was validated as a plain `string`, and
   the `Order` schema stored it as a `string` too. Every checkout was
   rejected with a type-mismatch validation error. Fixed by giving
   `shippingAddress` a real structured shape on both the DTO and the
   schema (a new `ShippingAddress` subdocument), matching the frontend's
   field names exactly — **zero frontend changes were needed**, the
   frontend's shape was already right.

6. **Every admin product-creation request failed, for two independent
   reasons stacked on top of each other:**
   - `CreateProductDto.slug` was required, but `ProductsService.create()`
     always generates the slug itself via `slugify(dto.name, ...)` and
     ignores whatever's sent — the admin form never sends one (correctly).
     Made `slug` optional.
   - `CreateProductDto.category` is required, but the admin "Add Product"
     form never had a category field or sent one at all. Rather than making
     a meaningful business field optional just to silence the error, added
     a real category dropdown to the frontend (`AdminAddProduct.tsx`,
     `src/api/categories.ts`) backed by the real, working `GET /categories`
     endpoint that already existed but had no frontend client.

7. **Profile updates were completely broken, not just the name fields.**
   `UpdateCustomerProfileDto` declared `firstName`/`lastName` (camelCase),
   but the `User` schema's real fields are lowercase `firstname`/`lastname`
   — and the frontend's `Profile.tsx` already correctly sends lowercase.
   With `forbidNonWhitelisted: true`, that meant the *entire* profile
   update request was rejected outright the moment it included a name
   field — which it always does. Renamed to match. Also removed
   `emergencyContact` and `department` from the DTO — neither is a real
   field on the `User` schema at all, so they were silently dropped by
   Mongoose's strict-mode `$set` even before this fix; harmless, but
   pointless to keep declared.

8. **`PaymentsService.rejectTransfer()` existed (and already fires a
   notification) but had no route exposing it at all.** Admins had no way
   to actually reject a bank transfer through the API. Added
   `PATCH /payments/bank-transfer/:paymentId/reject`, mirroring the
   approve route next to it.

9. **Brand deletion by ID has never worked.**
   `@Delete('brandId')` — missing the leading colon. That's a literal path
   segment (`/brands/brandId`), not a route parameter (`/brands/:brandId`)
   — only a request to the literal word "brandId" would ever match. Fixed
   to `@Delete(':brandId')`.

10. **`OrdersService.create()` silently dropped every cart item past the
    first one**, and stock was never actually decremented on checkout at
    all. (Found and fixed in the notifications round, carried forward —
    listed here for completeness since it's exactly this class of bug.)

## Security

11. **`POST /users` had no auth guard at all** — any unauthenticated
    caller on the internet could create a user account. Restricted to
    admins (`JwtAuthGuard` + `RolesGuard` + `Roles(Role.ADMIN)`), matching
    the pattern already used on `create-admin-profile` right next to it.

12. **Passwords were stored in plaintext, not hashed, in two places:**
    - `UsersService.create()` (the endpoint from #11) saved
      `data.password` directly with no `bcrypt.hash()` at all — compare to
      `AuthService.signup()`, which correctly hashes. As a second-order
      effect, accounts created this way could never have logged in either,
      since `AuthService.login()` compares via `bcrypt.compare()`, which
      can't match against a plaintext value.
    - `UsersService.update()` — reachable by any authenticated user via
      `PUT /users` (self-update) — had the identical gap: a `password`
      field in the update body went straight to the database unhashed. A
      "change password" feature built against this generic route would
      have silently corrupted the user's password to plaintext.

    Neither of these was reachable from the current frontend (checked —
    it never calls `POST /users`, and `Profile.tsx` uses the separate,
    already-correct `update-customer-profile` route instead), but both are
    live, callable API surface that needed fixing regardless of what the
    frontend happens to use today.

## Cleanup (not bugs, just noted — nothing broke, low priority)

- `PaymentsModule` provided `OrdersService` and `VariantsService` as raw
  providers (plus registered the `ProductVariant` schema) despite neither
  being injected anywhere in `PaymentsController` or `PaymentsService`.
  This created a second, entirely redundant instance of `OrdersService`
  scoped only to this module, for no reason. Removed all three.
- `brand.controller.ts` had a method named `ffindById` (double-f typo).
  Purely cosmetic — method names aren't externally visible — fixed anyway
  since it was a one-line, zero-risk change.
- `src/auth/dto/register.dto.ts` (`RegisterDto`) and
  `src/users/dto/profile.dto.ts` (`UserProfileDto`) are both dead code —
  never imported or used anywhere. Left in place rather than deleted,
  since removing existing files wasn't asked for, just noting they're
  vestigial.
- `User.role` is typed in the schema as `Types.ObjectId, ref: 'Role'` but
  every part of the codebase actually stores and queries it as a plain
  `Role` enum string (`'ADMIN'` / `'CUSTOMER'`) — a pre-existing schema/
  usage mismatch. Didn't touch this: it's evidently already "working" as
  everyone currently uses it, and changing the schema type is a real
  migration decision, not a drive-by fix.
- The `categories` module turned out to be fully real and functional
  (`GET/POST/PUT/DELETE /categories`) — earlier work on this project had
  assumed no categories endpoint existed and built `AdminCategories.tsx`
  to derive categories client-side from sampled products instead. That
  still works, but could be swapped for real CRUD against the actual
  endpoint now. Not done here — a deliberate follow-up, not a bug fix.
- No frontend UI exists for `POST /users/create-admin-profile` at all —
  the endpoint works (verified), there's just nothing in the frontend that
  calls it. A gap, not an error.
