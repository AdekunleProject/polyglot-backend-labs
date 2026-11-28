# Harlim ShopAll — storefront and admin console

React 18, TypeScript, Vite 5 and Tailwind v4 frontend for the [e-commerce backend](../e-commerce-backend). One app serves customers and staff (manager, admin, superadmin).

## Run it

```bash
npm install
npm run dev:demo
```

Demo mode runs entirely in the browser with seeded sample data, so no backend is needed. Use the buttons on the login page for the demo accounts. Password is `Demo@1234`, and every verification or 2FA code is `123456`.

| Account | Role |
| --- | --- |
| ada@demo.shop | Customer |
| manager@demo.shop | Manager (products, order status) |
| admin@demo.shop | Admin (payments, refund decisions) |
| super@demo.shop | Superadmin (audit log, weekly digest) |

## Run against the real backend

```bash
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the API address (default `http://localhost:5000`). Auth uses cookies for the password-reset flow, so the API and the frontend should share a site or sit behind one proxy. Or use `docker compose up --build` from this folder, which starts MongoDB (replica set), the backend (needs `../e-commerce-backend/.env`) and the frontend on http://localhost:5173.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server against the real API |
| `npm run dev:demo` | Dev server in demo mode |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | Typecheck and production build |
| `npm run build:demo` | Single-file demo build (`dist/index.html`) |

## Features

- Storefront: search, filters, product variants, cart, checkout, card payment through Paystack, bank transfer, order tracking, refunds and replacements, notifications.
- Account: profile, password change, two-factor setup with backup codes.
- Console: overview, products and variants, brands and categories, orders, payments, refund queue, people, reports with CSV export, audit log. Menus follow the backend's exact-match role rules.

## Notes

CI (`.github/workflows/ecommerce-frontend.yaml`) type-checks, builds and builds the Docker image. The `k8s/` manifests predate this redesign and still describe the old setup.
