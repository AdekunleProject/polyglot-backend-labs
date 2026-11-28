/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpError } from '../api/http-error';
import type { RequestOptions } from '../api/client';
import { productArt } from '../lib/art';
import { buildSeed, DEMO_CODE, newId, type Db, type Rec } from './seed';

/** Demo mode runs the whole store in the browser, with the same routes, roles and rules as the real API. */
export const DEMO: boolean = import.meta.env.VITE_DEMO === 'true';

const KEY = 'hsa_demo_db_v1';
const H = 3600_000;
let db: Db | null = null;
let resetEmail: string | null = null;

function normalise(d: Db): Db {
  d.products.forEach((p: Rec) => { if (Array.isArray(p.images) && p.images.some((u: unknown) => typeof u === 'string' && u.startsWith('blob:'))) p.images = [productArt(String(p.name), 'cart')]; });
  d.orders.forEach((o) => { if (o.status === 'delivered' && !o.deliveredAt) o.deliveredAt = o.updatedAt ?? o.createdAt; });
  return d;
}
function load(): Db {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { db = normalise(JSON.parse(raw) as Db); return db; }
  } catch { /* storage blocked or corrupt */ }
  db = normalise(buildSeed());
  save();
  return db;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked */ }
}
export function resetDemo() {
  db = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem('hsa_access_token'); localStorage.removeItem('hsa_refresh_token'); } catch { /* ignore */ }
  load();
}

const fail = (status: number, message: string): never => { throw new HttpError(status, { statusCode: status, message }, message); };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const nowIso = () => new Date().toISOString();

interface Ctx { method: string; params: string[]; query: Record<string, any>; body: Rec; user: Rec | null; form: FormData | null }

const publicUser = (u: Rec): Rec => {
  const { password: _p, ...rest } = u;
  void _p;
  return rest;
};
const guard = (ctx: Ctx, ...roles: string[]): Rec => {
  if (!ctx.user) return fail(401, 'Unauthorized');
  if (ctx.user.deactivatedAt || ctx.user.deletedAt) return fail(401, 'Unauthorized');
  if (roles.length && !roles.includes(ctx.user.role)) return fail(403, 'Forbidden resource');
  return ctx.user;
};
const record = (actor: Rec | null, action: string, target?: Rec, details: Rec = {}) =>
  load().audit.unshift({ _id: newId('au'), actorId: actor?.id ?? null, action, target: target ?? null, details, createdAt: nowIso() });
const notify = (recipient: string, type: string, title: string, message: string, link: string) =>
  load().notifications.unshift({ _id: newId('nt'), recipient, type, title, message, link, isRead: false, createdAt: nowIso() });
const staffIds = (...roles: string[]) => load().users.filter((u) => roles.includes(u.role)).map((u) => u.id);

const productById = (id: string) => load().products.find((p) => p._id === id);
const withTaxonomy = (p: Rec): Rec => {
  const d = load();
  return { ...p, category: d.categories.find((c) => c._id === p.category) ?? p.category, brand: d.brands.find((b) => b._id === p.brand) ?? p.brand };
};
const priceOfVariant = (v: Rec) => (v.price > 0 ? v.price : productById(v.product)?.price ?? 0);

function session(user: Rec) {
  return { accessToken: `demo.access.${user.id}.${Date.now()}`, refreshToken: `demo.refresh.${user.id}.${Date.now()}`, user: { id: user.id, firstname: user.firstname, lastname: user.lastname, email: user.email, role: user.role, profileImage: user.profileImage, restriction: user.mustChangePassword ? 'change-password' : undefined } };
}
function userFromToken(token: string | null): Rec | null {
  const m = token?.match(/^demo\.(?:access|refresh)\.([^.]+)\./);
  return m ? load().users.find((u) => u.id === m[1]) ?? null : null;
}

const validatePassword = (pw: string) => {
  if (pw.length < 8 || !/(?=.*[!@#$%^&*])(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])/.test(pw)) {
    fail(400, 'Password must be alpha-numeric, must have upper and lower case and at least one special character.');
  }
};

function pagination(items: Rec[], q: Rec, defLimit = 12) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || defLimit));
  return { slice: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length };
}

const dashboardRange = (q: Rec) => {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * H);
  return { from, to };
};

type Handler = (ctx: Ctx) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) => {
  const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, '([^/]+)') + '/?$');
  routes.push([method, re, handler]);
};

/* ----------------------------------- auth ----------------------------------- */
on('POST', '/auth/login', ({ body }) => {
  const u = load().users.find((x) => x.email.toLowerCase() === String(body.email ?? '').toLowerCase());
  if (!u || u.password !== body.password) return fail(401, 'Invalid credentials');
  if (u.deactivatedAt || u.deletedAt) return fail(403, 'This account is not active. Contact support.');
  if (!u.isVerified) return fail(403, 'Please verify your email first. Use the code we sent you.');
  if (u.twoFactorEnabled) return { twoFactorRequired: true, challengeToken: `demo.challenge.${u.id}`, message: 'Enter the code from your authenticator app.' };
  return session(u);
});
on('POST', '/auth/2fa/login', ({ body }) => {
  const id = String(body.challengeToken ?? '').split('.')[2];
  const u = load().users.find((x) => x.id === id);
  if (!u) return fail(401, 'This sign-in has expired. Start again.');
  if (body.code !== DEMO_CODE && !String(body.code).match(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/i)) return fail(401, 'That code is not right.');
  return session(u);
});
on('POST', '/auth/signup', ({ body }) => {
  const d = load();
  for (const f of ['firstname', 'lastname']) if (!/^[A-Za-z]+$/.test(String(body[f] ?? ''))) return fail(400, `${f} must contain letters only`);
  if (body.middlename && !/^[A-Za-z]+$/.test(body.middlename)) return fail(400, 'middlename must contain letters only');
  if (!/^\S+@\S+\.\S+$/.test(String(body.email ?? ''))) return fail(400, 'email must be an email');
  validatePassword(String(body.password ?? ''));
  for (const f of ['address', 'phoneNumber', 'dateOfBirth', 'gender']) if (!body[f]) return fail(400, `${f} should not be empty`);
  if (d.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) return fail(409, 'An account with this email already exists');
  const u: Rec = { id: newId(body.firstname), role: 'customer', isVerified: false, twoFactorEnabled: false, mustChangePassword: false, deactivatedAt: null, deletedAt: null, createdAt: nowIso(), ...body };
  d.users.push(u);
  save();
  return { message: `Welcome to Harlim ShopAll. We sent a 6-digit code to ${u.email}. In this demo the code is ${DEMO_CODE}.`, customer: publicUser(u) };
});
on('POST', '/auth/verify-email', ({ body }) => {
  const u = load().users.find((x) => x.email.toLowerCase() === String(body.email).toLowerCase());
  if (!u || body.code !== DEMO_CODE) return fail(400, 'That code is invalid or has expired.');
  u.isVerified = true;
  notify(u.id, 'USER_SIGNUP', 'Welcome to Harlim ShopAll', `Welcome, ${u.firstname}! Your account is ready.`, '/shop');
  save();
  return { message: 'Email verified. You can sign in now.' };
});
on('POST', '/auth/resend-verification', () => ({ message: `If the account exists, a new code was sent. In this demo the code is ${DEMO_CODE}.` }));
on('POST', '/auth/forgot-password', ({ body }) => { resetEmail = null; void body; return { message: `If an account exists, a reset code was sent. In this demo the code is ${DEMO_CODE}.` }; });
on('POST', '/auth/verify-password', ({ body }) => {
  const u = load().users.find((x) => x.email.toLowerCase() === String(body.email).toLowerCase());
  if (!u || body.code !== DEMO_CODE) return fail(400, 'That code is invalid or has expired.');
  resetEmail = u.email;
  return { message: 'Code accepted. Choose a new password within 10 minutes.' };
});
on('POST', '/auth/reset-password', ({ body }) => {
  if (!resetEmail) return fail(400, 'Your reset session has expired. Start again.');
  if (body.newPassword !== body.confirmPassword) return fail(400, 'Passwords do not match');
  validatePassword(String(body.newPassword ?? ''));
  const u = load().users.find((x) => x.email === resetEmail)!;
  u.password = body.newPassword;
  resetEmail = null;
  save();
  return { message: 'Password updated. Sign in with your new password.' };
});
on('POST', '/auth/refresh', ({ body }) => {
  const u = userFromToken(String(body.refreshToken ?? ''));
  if (!u) return fail(401, 'Invalid refresh token');
  const s = session(u);
  return { accessToken: s.accessToken, refreshToken: s.refreshToken };
});
on('POST', '/auth/logout', () => ({ message: 'Signed out' }));
on('GET', '/auth/me', (c) => { const u = guard(c); return session(u).user; });
on('POST', '/auth/2fa/setup', (c) => { guard(c); return { secret: 'HARLIMSHOPALLDEMO2FA', otpauthUrl: 'otpauth://totp/Harlim%20ShopAll:demo?secret=HARLIMSHOPALLDEMO2FA&issuer=Harlim%20ShopAll' }; });
on('POST', '/auth/2fa/enable', (c) => {
  const u = guard(c);
  if (c.body.code !== DEMO_CODE) return fail(400, 'That code is not right.');
  u.twoFactorEnabled = true; save();
  return { message: 'Two-factor authentication is on.', recoveryCodes: ['K3M9X-2ABPQ', 'P7W4N-8ZQRT', 'D5T6Y-1RCHJ', 'H2V8J-4USKL'] };
});
on('POST', '/auth/2fa/disable', (c) => {
  const u = guard(c);
  if (c.body.code !== DEMO_CODE) return fail(400, 'That code is not right.');
  u.twoFactorEnabled = false; save();
  return { message: 'Two-factor authentication is off.' };
});

/* ----------------------------------- users ---------------------------------- */
on('GET', '/users/profile', (c) => publicUser(guard(c)));
on('PATCH', '/users/update-customer-profile', (c) => {
  const u = guard(c);
  for (const k of ['firstname', 'middlename', 'lastname', 'phoneNumber', 'address', 'gender', 'dateOfBirth']) if (c.body[k] !== undefined) u[k] = c.body[k];
  save();
  return publicUser(u);
});
on('POST', '/users/me/change-password', (c) => {
  const u = guard(c);
  if (u.password !== c.body.currentPassword) return fail(400, 'Your current password is not right.');
  validatePassword(String(c.body.newPassword ?? ''));
  u.password = c.body.newPassword; u.mustChangePassword = false; save();
  return { message: 'Password changed.' };
});
on('GET', '/users', (c) => {
  guard(c, 'manager', 'admin', 'superadmin');
  let list = load().users.filter((u) => (c.query.deleted === 'true' ? u.deletedAt : !u.deletedAt));
  const rank: Record<string, string[]> = { manager: ['customer'], admin: ['customer', 'manager'], superadmin: ['customer', 'manager', 'admin'] };
  list = list.filter((u) => rank[c.user!.role].includes(u.role));
  if (c.query.search) { const s = String(c.query.search).toLowerCase(); list = list.filter((u) => `${u.firstname} ${u.lastname} ${u.email}`.toLowerCase().includes(s)); }
  const p = pagination(list, { ...c.query, limit: c.query.limit ?? 20 }, 20);
  return { items: p.slice.map(publicUser), total: p.total, page: p.page, limit: p.limit };
});
const targetUser = (c: Ctx): Rec => {
  const actor = guard(c, 'manager', 'admin', 'superadmin');
  const u = load().users.find((x) => x.id === c.params[0]);
  if (!u) return fail(404, 'User not found');
  const rank: Record<string, string[]> = { manager: ['customer'], admin: ['customer', 'manager'], superadmin: ['customer', 'manager', 'admin'] };
  if (u.id === actor.id || !rank[actor.role].includes(u.role)) return fail(403, 'You cannot act on this account');
  return u;
};
const needReason = (c: Ctx) => { const r = String(c.body.reason ?? '').trim(); if (r.length < 5 || r.length > 500) fail(400, 'reason must be between 5 and 500 characters'); return r; };
on('PATCH', '/users/:id/deactivate', (c) => { const u = targetUser(c); const reason = needReason(c); u.deactivatedAt = nowIso(); record(c.user, 'user.deactivate', { type: 'user', id: u.id }, { reason }); save(); return publicUser(u); });
on('PATCH', '/users/:id/activate', (c) => { const u = targetUser(c); u.deactivatedAt = null; record(c.user, 'user.activate', { type: 'user', id: u.id }); save(); return publicUser(u); });
on('DELETE', '/users/:id', (c) => { const u = targetUser(c); const reason = needReason(c); u.deletedAt = nowIso(); record(c.user, 'user.delete', { type: 'user', id: u.id }, { reason }); save(); return { message: 'Account deleted' }; });
on('PATCH', '/users/:id/restore', (c) => { const u = targetUser(c); u.deletedAt = null; record(c.user, 'user.restore', { type: 'user', id: u.id }); save(); return publicUser(u); });
on('PATCH', '/users/:id/role', (c) => { guard(c, 'admin', 'superadmin'); const u = targetUser(c); u.role = c.body.role; record(c.user, 'user.role', { type: 'user', id: u.id }, { role: c.body.role }); save(); return publicUser(u); });
on('POST', '/users/create-admin-profile', (c) => {
  const actor = guard(c, 'admin', 'superadmin');
  const allowed = actor.role === 'superadmin' ? ['admin', 'manager'] : ['manager'];
  if (!allowed.includes(c.body.role)) return fail(403, `You cannot create ${c.body.role} accounts`);
  if (load().users.some((u) => u.email === c.body.email)) return fail(400, 'User already exists');
  const u: Rec = { id: newId(c.body.firstname), firstname: c.body.firstname, lastname: c.body.lastname, email: c.body.email, role: c.body.role, password: 'Temp@12345', isVerified: true, twoFactorEnabled: false, mustChangePassword: true, deactivatedAt: null, deletedAt: null, createdAt: nowIso() };
  load().users.push(u);
  record(actor, 'user.create', { type: 'user', id: u.id }, { role: u.role });
  save();
  return { message: `Account created. In this demo the temporary password is Temp@12345.`, user: publicUser(u) };
});

/* ---------------------------------- catalog --------------------------------- */
on('GET', '/products', (c) => {
  const q = c.query;
  let list = load().products.filter((p) => p.isActive);
  if (q.search) { const s = String(q.search).toLowerCase(); list = list.filter((p) => `${p.name} ${p.description} ${p.sku}`.toLowerCase().includes(s)); }
  if (q.category) list = list.filter((p) => p.category === q.category);
  if (q.brand) list = list.filter((p) => p.brand === q.brand);
  if (q.minPrice) list = list.filter((p) => p.price >= Number(q.minPrice));
  if (q.maxPrice) list = list.filter((p) => p.price <= Number(q.maxPrice));
  if (q.featured === 'true') list = list.filter((p) => p.featured);
  const key = q.sortBy ?? 'createdAt';
  const dir = q.sortOrder === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
  const p = pagination(list, q);
  return { data: p.slice.map(withTaxonomy), meta: { total: p.total, page: p.page, limit: p.limit, totalPages: Math.max(1, Math.ceil(p.total / p.limit)) } };
});
on('GET', '/products/:id', (c) => { const p = productById(c.params[0]); return p ? withTaxonomy(p) : fail(404, 'Product not found'); });
const dataUrls = new WeakMap<File, string>();
const fileUrl = (f: File): string => dataUrls.get(f) ?? '';
async function toDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
  if (!file.type.startsWith('image/')) return raw;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = raw; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } catch { return raw; }
}

const imagesFromForm = (form: FormData | null, seed: string, kind = 'cart'): string[] => {
  const files = form ? form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0) : [];
  return files.length ? files.map((f) => fileUrl(f)) : [productArt(seed, kind)];
};
on('POST', '/products', (c) => {
  const actor = guard(c, 'manager');
  const f = c.form!;
  const name = String(f.get('name') ?? '').trim();
  const price = Number(f.get('price'));
  if (!name) return fail(400, 'name should not be empty');
  if (!(price > 0)) return fail(400, 'price must be a positive number');
  const sku = String(f.get('sku') ?? `HSA-${Date.now().toString().slice(-6)}`);
  if (load().products.some((p) => p.sku === sku)) return fail(409, 'A product with this SKU already exists');
  const p: Rec = { _id: newId(name), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sku, description: String(f.get('description') ?? ''), price, discountPrice: 0, images: imagesFromForm(f, name), category: String(f.get('category') ?? ''), brand: String(f.get('brand') ?? ''), featured: f.get('featured') === 'true', isActive: true, createdAt: nowIso() };
  load().products.unshift(p);
  record(actor, 'product.create', { type: 'product', id: p._id }, { name });
  save();
  return withTaxonomy(p);
});
on('PUT', '/products/:id', (c) => {
  const actor = guard(c, 'manager');
  const p = productById(c.params[0]);
  if (!p) return fail(404, 'Product not found');
  const fields = ['name', 'description', 'price', 'sku', 'featured', 'isActive', 'category', 'brand'].filter((k) => c.body[k] !== undefined);
  fields.forEach((k) => { p[k] = c.body[k]; });
  record(actor, 'product.update', { type: 'product', id: p._id }, { fields });
  save();
  return withTaxonomy(p);
});
on('POST', '/products/:id/images', (c) => {
  const actor = guard(c, 'manager');
  const p = productById(c.params[0]);
  if (!p) return fail(404, 'Product not found');
  const added = c.form ? c.form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0).map((f) => fileUrl(f)) : [];
  if (!added.length) return fail(400, 'Choose at least one image.');
  const current = (p.images as string[]).filter((u) => !u.startsWith('data:image/svg'));
  if (current.length + added.length > 10) return fail(400, 'A product can have at most 10 images.');
  p.images = [...current, ...added];
  record(actor, 'product.update', { type: 'product', id: p._id }, { fields: ['images'] });
  save();
  return withTaxonomy(p);
});
on('DELETE', '/products/:id/images', (c) => {
  const actor = guard(c, 'manager');
  const p = productById(c.params[0]);
  if (!p) return fail(404, 'Product not found');
  p.images = (p.images as string[]).filter((u) => u !== c.body.url);
  record(actor, 'product.update', { type: 'product', id: p._id }, { fields: ['images'] });
  save();
  return withTaxonomy(p);
});
on('DELETE', '/products/:id', (c) => {
  const actor = guard(c, 'manager');
  const d = load();
  const p = productById(c.params[0]);
  if (!p) return fail(404, 'Product not found');
  d.products = d.products.filter((x) => x._id !== p._id);
  d.variants = d.variants.filter((v) => v.product !== p._id);
  record(actor, 'product.delete', { type: 'product', id: p._id }, { name: p.name });
  save();
  return { message: 'Product deleted' };
});
on('GET', '/variants/product/:id', (c) => load().variants.filter((v) => v.product === c.params[0] && v.isActive !== false));
on('POST', '/variants', (c) => {
  const actor = guard(c, 'manager');
  const f = c.form!;
  const product = String(f.get('product') ?? '');
  const p = productById(product);
  if (!p) return fail(404, 'Product not found');
  let attributes: Record<string, string> = {};
  try { attributes = JSON.parse(String(f.get('attributes') ?? '{}')); } catch { return fail(400, 'attributes must be valid JSON'); }
  const sku = String(f.get('sku') ?? '');
  if (!sku) return fail(400, 'sku should not be empty');
  if (load().variants.some((v) => v.sku === sku)) return fail(409, 'A variant with this SKU already exists');
  const v: Rec = { _id: newId(sku), product, sku, price: Number(f.get('price') ?? 0) || 0, stock: Number(f.get('stock') ?? 0) || 0, attributes, images: [], isActive: true };
  load().variants.push(v);
  record(actor, 'variant.create', { type: 'variant', id: v._id }, { sku });
  save();
  return v;
});
on('PATCH', '/variants/:id/stock', (c) => {
  const actor = guard(c, 'manager');
  const v = load().variants.find((x) => x._id === c.params[0]);
  if (!v) return fail(404, 'Variant not found');
  const stock = Number(c.body.stock);
  if (!Number.isInteger(stock) || stock < 0) return fail(400, 'stock must not be less than 0');
  v.stock = stock;
  record(actor, 'variant.stock', { type: 'variant', id: v._id }, { stock });
  save();
  return v;
});
on('DELETE', '/variants/:id', (c) => {
  const actor = guard(c, 'manager');
  const d = load();
  const v = d.variants.find((x) => x._id === c.params[0]);
  if (!v) return fail(404, 'Variant not found');
  d.variants = d.variants.filter((x) => x._id !== v._id);
  record(actor, 'variant.delete', { type: 'variant', id: v._id }, { sku: v.sku });
  save();
  return { message: 'Variant deleted' };
});
for (const [path, key] of [['brands', 'brands'], ['categories', 'categories']] as const) {
  on('GET', `/${path}`, () => load()[key]);
  on('POST', `/${path}`, (c) => {
    guard(c, 'manager', 'admin', 'superadmin');
    const name = String(c.body.name ?? '').trim();
    if (!name) return fail(400, 'name should not be empty');
    if (load()[key].some((x) => x.name.toLowerCase() === name.toLowerCase())) return fail(409, 'Already exists');
    const item = { _id: newId(name), name, description: c.body.description };
    load()[key].push(item); save();
    return item;
  });
  on('DELETE', `/${path}/:id`, (c) => {
    guard(c, 'manager', 'admin', 'superadmin');
    (load() as any)[key] = load()[key].filter((x) => x._id !== c.params[0]); save();
    return { message: 'Deleted' };
  });
}

/* ------------------------------------ cart ---------------------------------- */
const cartOf = (u: Rec) => (load().carts[u.id] ??= []);
const presentCart = (u: Rec) => ({ _id: `cart-${u.id}`, items: cartOf(u).map((i) => ({ quantity: i.quantity, variant: load().variants.find((v) => v._id === i.variant) })).filter((i) => i.variant) });
on('GET', '/cart', (c) => presentCart(guard(c, 'customer')));
on('POST', '/cart/items', (c) => {
  const u = guard(c, 'customer');
  const v = load().variants.find((x) => x._id === c.body.variantId);
  const qty = Number(c.body.quantity);
  if (!v) return fail(404, 'Variant not found');
  if (!Number.isInteger(qty) || qty < 1) return fail(400, 'quantity must not be less than 1');
  const line = cartOf(u).find((i) => i.variant === v._id);
  const total = (line?.quantity ?? 0) + qty;
  if (total > v.stock) return fail(400, `Only ${v.stock} left in stock`);
  if (line) line.quantity = total; else cartOf(u).push({ variant: v._id, quantity: qty });
  save();
  return presentCart(u);
});
on('DELETE', '/cart/items/:id', (c) => { const u = guard(c, 'customer'); load().carts[u.id] = cartOf(u).filter((i) => i.variant !== c.params[0]); save(); return presentCart(u); });
on('DELETE', '/cart', (c) => { const u = guard(c, 'customer'); load().carts[u.id] = []; save(); return presentCart(u); });

/* ----------------------------------- orders --------------------------------- */
const presentOrder = (o: Rec) => clone(o);
on('POST', '/orders', (c) => {
  const u = guard(c, 'customer');
  const cart = cartOf(u);
  if (!cart.length) return fail(400, 'Your cart is empty');
  const a = c.body.shippingAddress ?? {};
  for (const f of ['fullName', 'line1', 'city', 'state', 'postalCode', 'country']) if (!a[f]) return fail(400, `shippingAddress.${f} should not be empty`);
  const d = load();
  const items = cart.map((line) => {
    const v = d.variants.find((x) => x._id === line.variant)!;
    const p = productById(v.product)!;
    if (v.stock < line.quantity) fail(400, `${p.name} has only ${v.stock} left`);
    const unitPrice = priceOfVariant(v);
    return { productId: p._id, variantId: v._id, productName: p.name, variantSku: v.sku, attributes: v.attributes, images: p.images.slice(0, 1), quantity: line.quantity, unitPrice, totalPrice: unitPrice * line.quantity };
  });
  cart.forEach((line) => { const v = d.variants.find((x) => x._id === line.variant)!; v.stock -= line.quantity; });
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  const order: Rec = { _id: newId('ord'), user: u.id, items, shippingAddress: a, subtotal, total: subtotal, status: 'pending', paymentStatus: 'pending', createdAt: nowIso(), updatedAt: nowIso() };
  d.orders.unshift(order);
  d.carts[u.id] = [];
  notify(u.id, 'ORDER_PLACED', 'Order placed', 'We received your order and are waiting for payment.', `/orders/${order._id}`);
  staffIds('manager', 'admin', 'superadmin').forEach((id) => notify(id, 'NEW_ORDER', 'New order', `${u.firstname} placed an order.`, '/admin/orders'));
  save();
  return presentOrder(order);
});
on('GET', '/orders/my-orders', (c) => {
  const u = guard(c, 'customer');
  const list = load().orders.filter((o) => o.user === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list.length ? list.map(presentOrder) : fail(404, 'No orders found for this user.');
});
on('GET', '/orders/my-orders/:id', (c) => {
  const u = guard(c, 'customer');
  const o = load().orders.find((x) => x._id === c.params[0] && x.user === u.id);
  return o ? presentOrder(o) : fail(404, 'Order not found');
});
on('GET', '/orders', (c) => {
  guard(c, 'manager', 'admin', 'superadmin');
  const d = load();
  return d.orders.map((o) => { const u = d.users.find((x) => x.id === o.user); return { ...presentOrder(o), user: u ? { _id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email } : o.user } as Rec; }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
});
on('GET', '/orders/:id', (c) => {
  guard(c, 'manager', 'admin', 'superadmin');
  const o = load().orders.find((x) => x._id === c.params[0]);
  return o ? presentOrder(o) : fail(404, 'Order not found');
});
on('PUT', '/orders/:id', (c) => {
  const actor = guard(c, 'manager');
  const o = load().orders.find((x) => x._id === c.params[0]);
  if (!o) return fail(404, 'Order not found');
  const status = String(c.body.status);
  if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) return fail(400, 'status must be a valid enum value');
  const from = o.status;
  if (status !== from) {
    o.status = status; o.updatedAt = nowIso();
    if (status === 'delivered') o.deliveredAt = nowIso();
    record(actor, 'order.status', { type: 'order', id: o._id }, { from, to: status });
    notify(o.user, 'ORDER_STATUS_CHANGED', `Order ${status}`, status === 'delivered' ? 'Your order was delivered. Not right? You have 24 hours to report a fault.' : `Your order is now ${status}.`, `/orders/${o._id}`);
  }
  save();
  return presentOrder(o);
});

/* ---------------------------------- payments -------------------------------- */
const ownOrder = (c: Ctx, id: string): Rec => {
  const u = guard(c, 'customer');
  const o = load().orders.find((x) => x._id === id && x.user === u.id);
  if (!o) return fail(404, 'Order not found');
  if (o.paymentStatus === 'paid') return fail(400, 'This order is already paid');
  return o;
};
on('POST', '/payments/initialize', (c) => {
  const o = ownOrder(c, String(c.body.orderId));
  const d = load();
  let pay = d.payments.find((p) => p.order === o._id && p.provider === 'PAYSTACK' && p.status === 'PENDING');
  if (!pay) {
    pay = { _id: newId('pay'), order: o._id, user: o.user, amount: o.total, currency: 'NGN', provider: 'PAYSTACK', status: 'PENDING', transactionReference: `PAY-${newId('r').slice(0, 14)}`, createdAt: nowIso() };
    d.payments.unshift(pay);
  }
  save();
  return { authorizationUrl: `#/demo/paystack?reference=${pay.transactionReference}`, accessCode: 'demo', reference: pay.transactionReference };
});
on('POST', '/demo/charge', (c) => {
  const pay = load().payments.find((p) => p.transactionReference === c.body.reference);
  if (!pay) return fail(404, 'Payment not found');
  if (c.body.outcome === 'success') settle(pay);
  else { pay.status = 'FAILED'; }
  save();
  return { status: pay.status };
});
function settle(pay: Rec) {
  const o = load().orders.find((x) => x._id === pay.order)!;
  pay.status = 'PAID'; pay.paidAt = nowIso();
  o.paymentStatus = 'paid'; o.updatedAt = nowIso();
  notify(o.user, 'PAYMENT_SUCCESS', 'Payment received', 'Thank you. Your payment was confirmed.', `/orders/${o._id}`);
  staffIds('admin', 'superadmin').forEach((id) => notify(id, 'PAYMENT_SUCCESS', 'Payment received', 'A customer payment was confirmed.', '/admin/payments'));
}
on('GET', '/payments/verify/:ref', (c) => {
  guard(c);
  const pay = load().payments.find((p) => p.transactionReference === c.params[0]);
  if (!pay) return fail(404, 'Payment not found');
  return { status: pay.status, message: pay.status === 'PAID' ? 'Payment verified' : 'Payment not completed' };
});
on('POST', '/payments/bank-transfer', (c) => {
  const o = ownOrder(c, String(c.body.orderId));
  const d = load();
  let pay = d.payments.find((p) => p.order === o._id && p.provider === 'BANK_TRANSFER' && p.status === 'PENDING');
  if (!pay) {
    pay = { _id: newId('pay'), order: o._id, user: o.user, amount: o.total, currency: 'NGN', provider: 'BANK_TRANSFER', status: 'PENDING', transactionReference: `BANK-${newId('r').slice(0, 12)}`, createdAt: nowIso(), bankName: 'Harlim Microfinance Bank', accountName: 'Harlim ShopAll Ltd', accountNumber: '0123456789' };
    d.payments.unshift(pay);
  }
  save();
  return { paymentId: pay._id, reference: pay.transactionReference, amount: pay.amount, bankName: pay.bankName, accountName: pay.accountName, accountNumber: pay.accountNumber };
});
on('POST', '/payments/bank-transfer/confirm', (c) => {
  const u = guard(c, 'customer');
  const f = c.form!;
  const pay = load().payments.find((p) => p._id === f.get('paymentId') && p.user === u.id);
  if (!pay) return fail(404, 'Payment not found');
  const file = f.get('receipt');
  const url = String(f.get('receiptUrl') ?? '');
  if (!url && !(file instanceof File)) return fail(400, 'Add a receipt link or upload your receipt');
  pay.receiptUrl = url || (file instanceof File ? fileUrl(file) : '');
  pay.status = 'AWAITING_CONFIRMATION';
  staffIds('admin', 'superadmin').forEach((id) => notify(id, 'TRANSFER_SUBMITTED', 'Bank transfer submitted', `${u.firstname} submitted a transfer receipt.`, '/admin/payments'));
  save();
  return { message: 'Receipt received. We will confirm your payment shortly.' };
});
on('GET', '/payments/my-payments', (c) => {
  const u = guard(c, 'customer');
  const list = load().payments.filter((p) => p.user === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list.length ? list : fail(404, 'No payments found');
});
on('GET', '/payments', (c) => {
  guard(c, 'admin', 'superadmin');
  const d = load();
  return d.payments.map((p) => { const u = d.users.find((x) => x.id === p.user); return { ...p, user: u ? { _id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email } : p.user } as Rec; }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
});
on('PATCH', '/payments/bank-transfer/:id/approve', (c) => {
  const actor = guard(c, 'admin', 'superadmin');
  const pay = load().payments.find((p) => p._id === c.params[0]);
  if (!pay || pay.status !== 'AWAITING_CONFIRMATION') return fail(400, 'This transfer is not waiting for review');
  settle(pay);
  record(actor, 'payment.transfer_approve', { type: 'payment', id: pay._id });
  save();
  return pay;
});
on('PATCH', '/payments/bank-transfer/:id/reject', (c) => {
  const actor = guard(c, 'admin', 'superadmin');
  const pay = load().payments.find((p) => p._id === c.params[0]);
  if (!pay || pay.status !== 'AWAITING_CONFIRMATION') return fail(400, 'This transfer is not waiting for review');
  pay.status = 'FAILED';
  record(actor, 'payment.transfer_reject', { type: 'payment', id: pay._id });
  save();
  return pay;
});

/* ---------------------------------- refunds --------------------------------- */
on('POST', '/refunds', (c) => {
  const u = guard(c, 'customer');
  const f = c.form!;
  const d = load();
  const type = String(f.get('type'));
  const o = d.orders.find((x) => x._id === f.get('orderId') && x.user === u.id);
  if (!o) return fail(404, 'Order not found');
  const pay = d.payments.find((p) => p.order === o._id && p.status === 'PAID');
  if (!pay) return fail(400, 'This order has no confirmed payment to refund');
  if (d.refunds.some((r) => r.order === o._id)) return fail(409, 'This order already has a refund request');
  const reason = String(f.get('reason') ?? '').trim();
  if (reason.length < 10) return fail(400, 'reason must be longer than or equal to 10 characters');
  let resolution = String(f.get('resolution') ?? '');
  const files = f.getAll('evidence').filter((x): x is File => x instanceof File && x.size > 0);
  if (type === 'DEFECT') {
    if (o.status !== 'delivered' || !o.deliveredAt) return fail(400, 'A damaged or faulty item can only be reported after the order is delivered');
    if (!resolution) return fail(400, 'Choose a refund or a replacement');
    if (!files.length) return fail(400, 'Please attach clear photos or a video showing the problem');
    const hours = (Date.now() - new Date(o.deliveredAt).getTime()) / H;
    if (hours > 72) return fail(400, 'The 72-hour window for complaints has passed');
    if (resolution === 'REFUND' && hours > 24) return fail(400, 'More than 24 hours have passed since delivery, so only a replacement can be requested');
  } else {
    if (!['pending', 'processing', 'shipped'].includes(o.status)) return fail(400, 'Only an order that has not arrived can be cancelled for a refund');
    resolution = 'REFUND';
  }
  const r: Rec = { id: newId('rf'), order: o._id, payment: pay._id, user: u.id, type, resolution, reason, evidence: files.map((x) => fileUrl(x)), evidenceCount: files.length, amount: type === 'CANCELLATION' ? Math.round(o.total * 0.65) : o.total, status: 'SUBMITTED', verificationNote: null, decisionNote: null, createdAt: nowIso() };
  d.refunds.unshift(r);
  staffIds('manager', 'admin', 'superadmin').forEach((id) => notify(id, 'REFUND_REQUESTED', 'Refund requested', `${u.firstname} opened a ${type.toLowerCase()} request.`, '/admin/refunds'));
  save();
  return r;
});
on('GET', '/refunds/mine', (c) => { const u = guard(c, 'customer'); return load().refunds.filter((r) => r.user === u.id); });
on('GET', '/refunds', (c) => {
  guard(c, 'manager', 'admin', 'superadmin');
  let list = load().refunds;
  if (c.query.status) list = list.filter((r) => r.status === c.query.status);
  const p = pagination(list, { ...c.query, limit: c.query.limit ?? 20 }, 20);
  return { items: p.slice, total: p.total, page: p.page, limit: p.limit };
});
on('GET', '/refunds/:id', (c) => { guard(c, 'manager', 'admin', 'superadmin'); return load().refunds.find((r) => r.id === c.params[0]) ?? fail(404, 'Refund request not found'); });
const refundOf = (c: Ctx) => load().refunds.find((r) => r.id === c.params[0]) ?? fail(404, 'Refund request not found');
on('PATCH', '/refunds/:id/verify', (c) => {
  const actor = guard(c, 'manager');
  const r = refundOf(c);
  if (r.type !== 'DEFECT' || r.status !== 'SUBMITTED') return fail(400, 'Only a new complaint can be verified');
  r.status = c.body.approve ? 'VERIFIED' : 'REJECTED'; r.verificationNote = c.body.note || null;
  record(actor, 'refund.verify', { type: 'refund', id: r.id }, { approve: !!c.body.approve });
  notify(r.user, 'REFUND_UPDATE', 'Complaint reviewed', c.body.approve ? 'Your complaint was verified and is with an admin for a decision.' : 'Your complaint could not be verified.', '/refunds');
  save();
  return r;
});
on('PATCH', '/refunds/:id/decide', (c) => {
  const actor = guard(c, 'admin', 'superadmin');
  const r = refundOf(c);
  const ready = (r.type === 'DEFECT' && r.status === 'VERIFIED') || (r.type === 'CANCELLATION' && r.status === 'SUBMITTED');
  if (!ready) return fail(400, 'This request is not waiting for a decision');
  if (!c.body.approve) r.status = 'DECLINED';
  else if (r.resolution === 'REPLACEMENT') r.status = 'REPLACEMENT_APPROVED';
  else {
    r.status = 'REFUNDED';
    const pay = load().payments.find((p) => p._id === r.payment);
    const o = load().orders.find((x) => x._id === r.order);
    if (pay) { pay.status = 'REFUNDED'; pay.refundedAmount = r.amount; }
    if (o) { o.paymentStatus = 'refunded'; if (r.type === 'CANCELLATION') o.status = 'cancelled'; }
  }
  r.decisionNote = c.body.note || null;
  record(actor, 'refund.decide', { type: 'refund', id: r.id }, { approve: !!c.body.approve });
  notify(r.user, 'REFUND_UPDATE', 'Request decided', c.body.approve ? 'Your request was approved.' : 'Your request was declined.', '/refunds');
  save();
  return r;
});
on('PATCH', '/refunds/:id/replacement-sent', (c) => {
  const actor = guard(c, 'manager');
  const r = refundOf(c);
  if (r.status !== 'REPLACEMENT_APPROVED') return fail(400, 'There is no approved replacement to send');
  r.status = 'REPLACEMENT_SENT';
  record(actor, 'refund.replacement_sent', { type: 'refund', id: r.id });
  notify(r.user, 'REFUND_UPDATE', 'Replacement on its way', 'Your replacement has been dispatched.', '/refunds');
  save();
  return r;
});

/* -------------------------------- notifications ----------------------------- */
on('GET', '/notifications', (c) => { const u = guard(c); return load().notifications.filter((n) => n.recipient === u.id && (c.query.unreadOnly !== 'true' || !n.isRead)).slice(0, 50); });
on('GET', '/notifications/unread-count', (c) => { const u = guard(c); return { count: load().notifications.filter((n) => n.recipient === u.id && !n.isRead).length }; });
on('PATCH', '/notifications/read-all', (c) => { const u = guard(c); load().notifications.forEach((n) => { if (n.recipient === u.id) n.isRead = true; }); save(); return { message: 'ok' }; });
on('PATCH', '/notifications/:id/read', (c) => { const u = guard(c); const n = load().notifications.find((x) => x._id === c.params[0] && x.recipient === u.id); if (n) n.isRead = true; save(); return n; });

/* --------------------------------- analytics -------------------------------- */
const sumPaid = (since?: number) => load().payments.filter((p) => p.status === 'PAID' && (!since || new Date(p.paidAt ?? p.createdAt).getTime() >= since)).reduce((s, p) => s + p.amount, 0);
on('GET', '/analytics/customer', (c) => {
  const u = guard(c, 'customer');
  const d = load();
  const mine = d.orders.filter((o) => o.user === u.id);
  const paid = d.payments.filter((p) => p.user === u.id && p.status === 'PAID');
  const spent = paid.reduce((s, p) => s + p.amount, 0);
  return {
    summary: {
      orders: { totalOrders: mine.length, pendingOrders: mine.filter((o) => o.status === 'pending').length, deliveredOrders: mine.filter((o) => o.status === 'delivered').length, cancelledOrders: mine.filter((o) => o.status === 'cancelled').length },
      payments: { user: { customerName: `${u.firstname} ${u.lastname}` }, totalSpent: spent, averagePayment: paid.length ? spent / paid.length : 0, totalPayments: paid.length },
    },
    recentOrders: mine.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  };
});
on('GET', '/analytics/manager', (c) => {
  const u = guard(c, 'manager');
  const d = load();
  const orders: Record<string, number> = {};
  d.orders.forEach((o) => { orders[o.status] = (orders[o.status] ?? 0) + 1; });
  const mine = d.audit.filter((a) => a.actorId === u.id);
  const byAction: Record<string, number> = {};
  mine.forEach((a) => { byAction[a.action] = (byAction[a.action] ?? 0) + 1; });
  return {
    orders,
    lateOrders: { count: d.orders.filter((o) => ['pending', 'processing'].includes(o.status) && o.paymentStatus === 'paid' && Date.now() - new Date(o.createdAt).getTime() > 48 * H).length, afterHours: 48 },
    stock: { low: d.variants.filter((v) => v.stock > 0 && v.stock <= 10).length, out: d.variants.filter((v) => v.stock === 0).length },
    refundWork: { complaintsToVerify: d.refunds.filter((r) => r.type === 'DEFECT' && r.status === 'SUBMITTED').length, replacementsToSend: d.refunds.filter((r) => r.status === 'REPLACEMENT_APPROVED').length },
    myActivity: { total: mine.length, byAction, lastActionAt: mine[0]?.createdAt ?? null },
  };
});
on('GET', '/analytics/admin', (c) => {
  const u = guard(c, 'admin');
  const d = load();
  return {
    summary: { user: { adminName: `${u.firstname} ${u.lastname}` }, revenue: sumPaid(), totalOrders: d.orders.length, pendingOrders: d.orders.filter((o) => o.status === 'pending').length, totalCustomers: d.users.filter((x) => x.role === 'customer').length, totalProducts: d.products.filter((p) => p.isActive).length },
    money: { revenueLast30Days: sumPaid(Date.now() - 30 * 24 * H), refundedLast30Days: d.payments.filter((p) => p.status === 'REFUNDED').reduce((s, p) => s + (p.refundedAmount ?? 0), 0), bankTransfersAwaitingReview: d.payments.filter((p) => p.status === 'AWAITING_CONFIRMATION').length },
    refundsAwaitingDecision: d.refunds.filter((r) => (r.type === 'DEFECT' && r.status === 'VERIFIED') || (r.type === 'CANCELLATION' && r.status === 'SUBMITTED')).length,
    recentOrders: d.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((o) => { const x = d.users.find((y) => y.id === o.user); return { _id: o._id, total: o.total, status: o.status, paymentStatus: o.paymentStatus, createdAt: o.createdAt, user: x ? { firstname: x.firstname, lastname: x.lastname, email: x.email } : null }; }),
  };
});
on('GET', '/analytics/superadmin', (c) => {
  guard(c, 'superadmin');
  const d = load();
  const team: Record<string, number> = {};
  d.users.filter((u) => u.role !== 'customer' && !u.deletedAt).forEach((u) => { team[u.role] = (team[u.role] ?? 0) + 1; });
  const counts: Record<string, number> = {};
  d.audit.filter((a) => Date.now() - new Date(a.createdAt).getTime() < 7 * 24 * H).forEach((a) => { counts[a.action] = (counts[a.action] ?? 0) + 1; });
  const refunds = d.refunds;
  return {
    money: { revenueAllTime: sumPaid(), revenueLast30Days: sumPaid(Date.now() - 30 * 24 * H), refundedLast30Days: d.payments.filter((p) => p.status === 'REFUNDED').reduce((s, p) => s + (p.refundedAmount ?? 0), 0), refundCountLast30Days: d.payments.filter((p) => p.status === 'REFUNDED').length },
    orders: { total: d.orders.length },
    customers: { total: d.users.filter((u) => u.role === 'customer' && !u.deletedAt).length },
    team: { byRole: team, deactivated: d.users.filter((u) => u.deactivatedAt && !u.deletedAt).length, staffWithout2fa: d.users.filter((u) => u.role !== 'customer' && !u.deletedAt && !u.twoFactorEnabled).map((u) => ({ _id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email, role: u.role })) },
    refundQueue: { complaintsToVerify: refunds.filter((r) => r.type === 'DEFECT' && r.status === 'SUBMITTED').length, awaitingDecision: refunds.filter((r) => (r.type === 'DEFECT' && r.status === 'VERIFIED') || (r.type === 'CANCELLATION' && r.status === 'SUBMITTED')).length, replacementsToSend: refunds.filter((r) => r.status === 'REPLACEMENT_APPROVED').length },
    activity: { last7DaysByAction: Object.entries(counts).map(([action, count]) => ({ action, count })), recent: d.audit.slice(0, 10) },
  };
});
const csvCell = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
on('GET', '/analytics/staff-activity', (c) => {
  const actor = guard(c, 'manager', 'admin', 'superadmin');
  const { from, to } = dashboardRange(c.query);
  const d = load();
  const visible: Record<string, string[]> = { manager: [], admin: ['manager'], superadmin: ['manager', 'admin'] };
  const staff = d.users.filter((u) => u.id === actor.id || visible[actor.role].includes(u.role));
  const rows = staff.map((p) => {
    const mine = d.audit.filter((a) => a.actorId === p.id && new Date(a.createdAt) >= from && new Date(a.createdAt) <= to);
    const actions: Record<string, number> = {};
    mine.forEach((a) => { actions[a.action] = (actions[a.action] ?? 0) + 1; });
    const deletes = mine.filter((a) => /delete/.test(a.action)).length;
    const lookups = mine.filter((a) => /view/.test(a.action)).length;
    const flags: string[] = [];
    if (deletes >= 3) flags.push('Many deletions');
    if (lookups >= 5) flags.push('Many private lookups');
    if (!p.twoFactorEnabled) flags.push('No two-factor');
    return { id: p.id, name: `${p.firstname} ${p.lastname}`, email: p.email, role: p.role, isActive: !p.deactivatedAt, twoFactorEnabled: !!p.twoFactorEnabled, totalActions: mine.length, lastActionAt: mine[0]?.createdAt ?? null, deletes, lookups, offHoursActions: 0, flags, actions };
  });
  record(actor, 'report.view', { type: 'report', id: 'staff-activity' }, { report: 'staff-activity' });
  if (c.query.format === 'csv') return ['Name,Email,Role,Actions,Deletions,Lookups,Flags', ...rows.map((r) => [r.name, r.email, r.role, r.totalActions, r.deletes, r.lookups, r.flags.join('; ')].map(csvCell).join(','))].join('\n');
  return { from: from.toISOString(), to: to.toISOString(), thresholds: {}, staff: rows };
});
on('GET', '/analytics/sales', (c) => {
  guard(c, 'admin', 'superadmin');
  const { from, to } = dashboardRange(c.query);
  const d = load();
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from.getTime() && t <= to.getTime(); };
  const days = new Map<string, { day: string; orders: number; payments: number; revenue: number }>();
  const day = (iso: string) => { const k = iso.slice(0, 10); if (!days.has(k)) days.set(k, { day: k, orders: 0, payments: 0, revenue: 0 }); return days.get(k)!; };
  d.orders.filter((o) => inRange(o.createdAt)).forEach((o) => { day(o.createdAt).orders += 1; });
  const paid = d.payments.filter((p) => p.status === 'PAID' && inRange(p.paidAt ?? p.createdAt));
  paid.forEach((p) => { const e = day(p.paidAt ?? p.createdAt); e.payments += 1; e.revenue += p.amount; });
  const refunded = d.payments.filter((p) => p.status === 'REFUNDED');
  const byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (c.query.format === 'csv') return ['Day,Orders,Payments,Revenue (NGN)', ...byDay.map((r) => [r.day, r.orders, r.payments, r.revenue].join(','))].join('\n');
  return { from: from.toISOString(), to: to.toISOString(), totals: { orders: d.orders.filter((o) => inRange(o.createdAt)).length, payments: paid.length, revenue: paid.reduce((s, p) => s + p.amount, 0), refunds: refunded.length, refundedAmount: refunded.reduce((s, p) => s + (p.refundedAmount ?? 0), 0), newCustomers: d.users.filter((u) => u.role === 'customer' && inRange(u.createdAt)).length }, byDay };
});
on('POST', '/analytics/digest/send', (c) => { const u = guard(c, 'superadmin'); record(u, 'digest.sent', undefined, {}); save(); return { message: 'Weekly digest sent (demo: no email leaves your browser).' }; });
on('GET', '/audit-logs', (c) => {
  guard(c, 'superadmin');
  let list = load().audit;
  if (c.query.action) list = list.filter((a) => a.action === c.query.action);
  const p = pagination(list, { ...c.query, limit: c.query.limit ?? 20 }, 20);
  return { items: p.slice, total: p.total, page: p.page, limit: p.limit };
});

/* --------------------------------- dispatcher ------------------------------- */
export async function demoRequest<T>(method: string, path: string, opts: RequestOptions, token: string | null): Promise<T> {
  await new Promise((r) => setTimeout(r, 140 + Math.random() * 180));
  // The real client sends every query value as a string, so the demo does the same.
  const query: Record<string, any> = Object.fromEntries(Object.entries((opts.params as Record<string, unknown> | undefined) ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const clean = path.split('?')[0];
  const form = opts.body instanceof FormData ? opts.body : null;
  if (form) for (const [, v] of form.entries()) if (v instanceof File && v.size > 0 && !dataUrls.has(v)) dataUrls.set(v, await toDataUrl(v));
  const body: Rec = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) : ((opts.body as Rec) ?? {});
  const user = opts.auth === false ? null : userFromToken(token);
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = clean.match(re);
    if (match) return clone(handler({ method, params: match.slice(1), query, body, user, form }) as T);
  }
  return fail(404, `Cannot ${method} ${clean}`);
}
