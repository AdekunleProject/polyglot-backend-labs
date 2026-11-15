// Fills a running API with a small demo catalogue (categories, brands,
// products, variants) by calling the API itself as the admin.
// Safe to run twice: anything that already exists is skipped.
//
//   docker compose exec api node scripts/demo-seed.mjs
//
// Optional: API_URL (default http://127.0.0.1:PORT), ADMIN_EMAIL, ADMIN_PASSWORD.

const base = process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 5000}`;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (they come from .env).');
  process.exit(1);
}

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

const login = await call('POST', '/auth/login', { email, password });
if (!login.ok) {
  console.error(`Admin login failed (${login.status}):`, login.data);
  process.exit(1);
}
const token = login.data.accessToken;

// Create, or find the existing one by name (the API rejects duplicates).
async function ensure(listPath, createPath, body) {
  const created = await call('POST', createPath, body, token);
  if (created.ok) {
    console.log(`created  ${body.name}`);
    return created.data;
  }
  const list = await call('GET', listPath);
  const items = Array.isArray(list.data) ? list.data : list.data?.data ?? list.data?.items ?? [];
  const found = items.find((i) => i.name === body.name);
  if (found) {
    console.log(`exists   ${body.name}`);
    return found;
  }
  throw new Error(`Could not create ${body.name}: ${created.status} ${JSON.stringify(created.data)}`);
}

const categories = {};
for (const [name, description] of [
  ['Phones', 'Smartphones and accessories'],
  ['Laptops', 'Laptops for work and study'],
  ['Shoes', 'Everyday and sports footwear'],
]) {
  categories[name] = await ensure('/categories', '/categories', { name, description });
}

const brands = {};
for (const name of ['Demo Mobile', 'Demo Compute', 'Demo Wear']) {
  brands[name] = await ensure('/brands', '/brands', { name, description: `${name} (demo data)` });
}

const products = [
  { name: 'Demo Phone X', cat: 'Phones', brand: 'Demo Mobile', price: 450000, sku: 'DEMO-PH-X',
    variants: [{ sku: 'DEMO-PH-X-BLK-128', stock: 20, attributes: { color: 'Black', storage: '128GB' } },
               { sku: 'DEMO-PH-X-BLU-256', stock: 10, price: 520000, attributes: { color: 'Blue', storage: '256GB' } }] },
  { name: 'Demo Phone Lite', cat: 'Phones', brand: 'Demo Mobile', price: 180000, sku: 'DEMO-PH-L',
    variants: [{ sku: 'DEMO-PH-L-WHT-64', stock: 35, attributes: { color: 'White', storage: '64GB' } }] },
  { name: 'Demo Laptop 14', cat: 'Laptops', brand: 'Demo Compute', price: 780000, sku: 'DEMO-LT-14',
    variants: [{ sku: 'DEMO-LT-14-8-256', stock: 8, attributes: { ram: '8GB', disk: '256GB' } },
               { sku: 'DEMO-LT-14-16-512', stock: 5, price: 950000, attributes: { ram: '16GB', disk: '512GB' } }] },
  { name: 'Demo Runner Shoe', cat: 'Shoes', brand: 'Demo Wear', price: 45000, discountPrice: 39000, sku: 'DEMO-SH-RUN',
    variants: [{ sku: 'DEMO-SH-RUN-42', stock: 30, attributes: { size: '42', color: 'Grey' } },
               { sku: 'DEMO-SH-RUN-44', stock: 3, attributes: { size: '44', color: 'Grey' } }] },
];

for (const p of products) {
  const product = await ensure('/products', '/products', {
    name: p.name,
    description: `${p.name}: demo product for trying the API.`,
    category: categories[p.cat]._id,
    brand: brands[p.brand]._id,
    price: p.price,
    ...(p.discountPrice ? { discountPrice: p.discountPrice } : {}),
    sku: p.sku,
  });
  for (const v of p.variants) {
    const r = await call('POST', '/variants', { product: product._id, ...v }, token);
    console.log(r.ok ? `  variant ${v.sku}` : `  variant ${v.sku} skipped (${r.status})`);
  }
}
console.log('\nDone. Browse GET /products, or open /docs.');
