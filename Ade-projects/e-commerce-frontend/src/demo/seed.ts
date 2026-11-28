import { productArt } from '../lib/art';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Rec = Record<string, any>;
export interface Db {
  users: Rec[]; brands: Rec[]; categories: Rec[]; products: Rec[]; variants: Rec[];
  carts: Record<string, Rec[]>; orders: Rec[]; payments: Rec[]; refunds: Rec[];
  notifications: Rec[]; audit: Rec[]; reviews: Rec[]; seq: number;
}

export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_CODE = '123456';
const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

let counter = 0;
export const newId = (seed = ''): string => {
  counter += 1;
  const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const tag = seed.replace(/\W/g, '').toLowerCase().slice(0, 4);
  return (tag + counter.toString(16).padStart(4, '0') + Date.now().toString(16) + rand).replace(/[^0-9a-f]/g, '0').slice(-24).padStart(24, '0');
};

const CATEGORIES: [string, string][] = [
  ['Phones & Tablets', 'Smartphones, tablets and accessories'],
  ['Computing', 'Laptops, desktops and peripherals'],
  ['Audio', 'Headphones, earbuds and speakers'],
  ['Watches', 'Smart watches, bands and classics'],
  ['Fashion', 'Everyday and occasion wear'],
  ['Footwear', 'Sneakers, loafers and sandals'],
  ['Home & Living', 'Kitchen, bedding and appliances'],
  ['Beauty', 'Skin, body and self-care'],
  ['Bags', 'Backpacks, weekenders and totes'],
];
const BRANDS = ['Harlim Select', 'Nova', 'Zenith', 'Aurora', 'Kente Co.', 'Lagos Loom', 'Pulse', 'Orbit'];

type Spec = { options: Record<string, string[]>; kind: string };
const SPECS: Record<string, Spec> = {
  phone: { kind: 'phone', options: { Colour: ['Midnight', 'Aurora'], Storage: ['128GB', '256GB'] } },
  laptop: { kind: 'laptop', options: { Colour: ['Graphite', 'Silver'] } },
  audio: { kind: 'audio', options: { Colour: ['Black', 'White'] } },
  watch: { kind: 'watch', options: { Strap: ['Black', 'Tan'] } },
  shirt: { kind: 'shirt', options: { Size: ['S', 'M', 'L', 'XL'] } },
  shoe: { kind: 'shoe', options: { Size: ['40', '42', '44'] } },
  home: { kind: 'home', options: { Edition: ['Standard'] } },
  beauty: { kind: 'beauty', options: { Size: ['50ml', '100ml'] } },
  bag: { kind: 'bag', options: { Colour: ['Olive', 'Black'] } },
};

// name, category, brand, price (naira), spec, featured, blurb
const PRODUCTS: [string, string, string, number, string, boolean, string][] = [
  ['Nova X12 Smartphone', 'Phones & Tablets', 'Nova', 485000, 'phone', true, 'A 6.7-inch AMOLED display, a 50MP camera system and two-day battery life in a slim aluminium body.'],
  ['Pulse Lite 5G', 'Phones & Tablets', 'Pulse', 215000, 'phone', false, 'Fast 5G, a bright 120Hz screen and a camera that handles Lagos nights, at a friendly price.'],
  ['Orbit Tab 10', 'Phones & Tablets', 'Orbit', 320000, 'phone', false, 'A 10-inch tablet for streaming, sketching and school, with a quad-speaker setup.'],
  ['Zenith Book Air 14"', 'Computing', 'Zenith', 920000, 'laptop', true, 'Light enough for the daily commute, quick enough for serious work. 16GB memory, 512GB SSD.'],
  ['Zenith Book Pro 16"', 'Computing', 'Zenith', 1450000, 'laptop', false, 'A colour-accurate 16-inch display and a cool-running processor for editors and engineers.'],
  ['Orbit Wireless Mouse', 'Computing', 'Orbit', 18500, 'laptop', false, 'Quiet clicks, a six-month battery and a USB-C receiver that lives inside the mouse.'],
  ['Pulse Buds Pro', 'Audio', 'Pulse', 62000, 'audio', true, 'Active noise cancelling earbuds with a pocketable case and 28 hours of total playtime.'],
  ['Nova Studio Headphones', 'Audio', 'Nova', 135000, 'audio', false, 'Over-ear headphones tuned for a balanced sound, with soft memory-foam cushions.'],
  ['Orbit Portable Speaker', 'Audio', 'Orbit', 48000, 'audio', false, 'Waterproof, loud and clear. Twelve hours of play on a single charge.'],
  ['Zenith Chrono Watch', 'Watches', 'Zenith', 98000, 'watch', true, 'Sapphire-coated glass, a stainless case and a strap that swaps in seconds.'],
  ['Pulse Fit Band', 'Watches', 'Pulse', 35000, 'watch', false, 'Heart rate, sleep and workout tracking with a fortnight of battery.'],
  ['Aurora Classic Watch', 'Watches', 'Aurora', 120000, 'watch', false, 'A slim dress watch with a domed crystal and a quiet, confident dial.'],
  ['Ankara Print Shirt', 'Fashion', 'Lagos Loom', 24500, 'shirt', true, 'Hand-finished Ankara cotton with a relaxed fit that works for work and weekends.'],
  ['Agbada Set, Royal Blue', 'Fashion', 'Kente Co.', 85000, 'shirt', false, 'A three-piece agbada with fine embroidery, tailored for ceremonies.'],
  ['Everyday Cotton Tee', 'Fashion', 'Harlim Select', 9500, 'shirt', false, 'Heavyweight cotton that keeps its shape wash after wash.'],
  ['Cloud Hoodie', 'Fashion', 'Harlim Select', 28000, 'shirt', false, 'Brushed-back fleece, a double-layer hood and a kangaroo pocket that is actually deep.'],
  ['Orbit Runner Sneakers', 'Footwear', 'Orbit', 45000, 'shoe', true, 'A responsive foam sole and a breathable knit upper for daily miles.'],
  ['Leather Loafers', 'Footwear', 'Kente Co.', 52000, 'shoe', false, 'Full-grain leather, hand-stitched and ready for the office or a wedding.'],
  ['Air Fryer 7.5L', 'Home & Living', 'Harlim Select', 78000, 'home', true, 'Crisp results with a spoon of oil. Eight presets and a dishwasher-safe basket.'],
  ['Aurora Power Blender', 'Home & Living', 'Aurora', 42000, 'home', false, 'A 1200W motor that handles ice, nuts and the toughest smoothies.'],
  ['Premium Bedding Set', 'Home & Living', 'Harlim Select', 36000, 'home', false, 'Four-piece, 300-thread-count cotton sateen in a soft, breathable weave.'],
  ['Glow Vitamin C Serum', 'Beauty', 'Aurora', 14500, 'beauty', true, 'A brightening daily serum with 15% vitamin C and hyaluronic acid.'],
  ['Shea Butter Care Set', 'Beauty', 'Kente Co.', 11000, 'beauty', false, 'Raw, ethically sourced shea in a body butter, lip balm and hand cream trio.'],
  ['Weekender Duffel Bag', 'Bags', 'Lagos Loom', 38000, 'bag', true, 'Water-resistant canvas, a shoe compartment and a shoulder strap that stays put.'],
  ['City Backpack', 'Bags', 'Harlim Select', 26000, 'bag', false, 'Padded laptop sleeve, hidden pocket and a trolley strap for trips.'],
];

export function buildSeed(): Db {
  const db: Db = { users: [], brands: [], categories: [], products: [], variants: [], carts: {}, orders: [], payments: [], refunds: [], notifications: [], audit: [], reviews: [], seq: 1 };

  const mkUser = (firstname: string, lastname: string, email: string, role: string, extra: Rec = {}) => {
    const u: Rec = {
      id: newId(firstname), firstname, lastname, email, role, password: DEMO_PASSWORD,
      phoneNumber: '+2348012345678', address: '12 Admiralty Way, Lekki, Lagos', gender: 'male', dateOfBirth: '1994-04-12',
      isVerified: true, twoFactorEnabled: false, mustChangePassword: false, deactivatedAt: null, deletedAt: null,
      createdAt: ago(40 * D), ...extra,
    };
    db.users.push(u);
    return u;
  };
  const ada = mkUser('Ada', 'Okafor', 'ada@demo.shop', 'customer', { gender: 'female' });
  const tunde = mkUser('Tunde', 'Bakare', 'tunde@demo.shop', 'customer', { createdAt: ago(25 * D) });
  const ngozi = mkUser('Ngozi', 'Eze', 'ngozi@demo.shop', 'customer', { gender: 'female', createdAt: ago(18 * D) });
  const ibrahim = mkUser('Ibrahim', 'Musa', 'ibrahim@demo.shop', 'customer', { createdAt: ago(9 * D) });
  const manager = mkUser('Folake', 'Adeyemi', 'manager@demo.shop', 'manager', { gender: 'female', twoFactorEnabled: true });
  const admin = mkUser('Chidi', 'Obi', 'admin@demo.shop', 'admin', { twoFactorEnabled: true });
  const sup = mkUser('Harlim', 'Owner', 'super@demo.shop', 'superadmin', { twoFactorEnabled: true });
  mkUser('Segun', 'Lawal', 'segun.manager@demo.shop', 'manager', { twoFactorEnabled: false });

  const catIds: Record<string, string> = {};
  CATEGORIES.forEach(([name, description]) => { const c = { _id: newId(name), name, description }; catIds[name] = c._id; db.categories.push(c); });
  const brandIds: Record<string, string> = {};
  BRANDS.forEach((name) => { const b = { _id: newId(name), name, description: `${name} products on Harlim ShopAll` }; brandIds[name] = b._id; db.brands.push(b); });

  PRODUCTS.forEach(([name, cat, brand, price, specKey, featured, blurb], idx) => {
    const spec = SPECS[specKey];
    const p: Rec = {
      _id: newId(name), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      sku: `HSA-${String(1000 + idx)}`, description: `${blurb} Free delivery on orders over ₦50,000. Covered by Harlim ShopAll buyer protection.`,
      price, discountPrice: 0, images: [productArt(name, spec.kind), productArt(name + ' alt', spec.kind)],
      category: catIds[cat], brand: brandIds[brand], featured, isActive: true, createdAt: ago((PRODUCTS.length - idx) * 0.9 * D),
    };
    db.products.push(p);
    const keys = Object.keys(spec.options);
    let combos: Record<string, string>[] = [{}];
    keys.forEach((k) => { combos = combos.flatMap((c) => spec.options[k].map((v) => ({ ...c, [k]: v }))); });
    combos.forEach((attributes, i) => {
      const bump = specKey === 'phone' && attributes.Storage === '256GB' ? Math.round(price * 0.12) : 0;
      let stock = 8 + ((idx * 7 + i * 5) % 40);
      if (name === 'Orbit Portable Speaker' && i === 1) stock = 0;
      if (name === 'Pulse Buds Pro' && i === 0) stock = 4;
      db.variants.push({
        _id: newId(name + i), product: p._id, sku: `${p.sku}-${String(i + 1).padStart(2, '0')}`,
        price: bump ? price + bump : 0, stock, attributes, images: [], isActive: true,
      });
    });
  });

  const variantsOf = (productName: string) => db.variants.filter((v) => db.products.find((p) => p._id === v.product)?.name === productName);
  const priceFor = (v: Rec) => (v.price > 0 ? v.price : db.products.find((p) => p._id === v.product)!.price);
  const addr = (u: Rec) => ({ fullName: `${u.firstname} ${u.lastname}`, line1: '12 Admiralty Way', line2: 'Lekki Phase 1', city: 'Lagos', state: 'Lagos', postalCode: '106104', country: 'Nigeria', phoneNumber: u.phoneNumber });

  const mkOrder = (user: Rec, picks: [string, number, number][], status: string, pay: string, createdAgo: number, provider: 'PAYSTACK' | 'BANK_TRANSFER' = 'PAYSTACK') => {
    const items = picks.map(([name, vi, qty]) => {
      const v = variantsOf(name)[vi] ?? variantsOf(name)[0];
      const p = db.products.find((x) => x._id === v.product)!;
      const unitPrice = priceFor(v);
      return { productId: p._id, variantId: v._id, productName: p.name, variantSku: v.sku, attributes: v.attributes, images: p.images.slice(0, 1), quantity: qty, unitPrice, totalPrice: unitPrice * qty };
    });
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    const order: Rec = { _id: newId('ord'), user: user.id, items, shippingAddress: addr(user), subtotal, total: subtotal, status, paymentStatus: pay, createdAt: ago(createdAgo), updatedAt: ago(Math.max(0, createdAgo - 6 * H)) };
    db.orders.push(order);
    const payment: Rec = {
      _id: newId('pay'), order: order._id, user: user.id, amount: subtotal, currency: 'NGN', provider,
      status: pay === 'paid' ? 'PAID' : pay === 'refunded' ? 'REFUNDED' : pay === 'failed' ? 'FAILED' : 'PENDING',
      transactionReference: `${provider === 'PAYSTACK' ? 'PAY' : 'BANK'}-${newId('ref').slice(0, 12)}`, createdAt: order.createdAt,
    };
    db.payments.push(payment);
    return { order, payment };
  };

  const o1 = mkOrder(ada, [['Pulse Buds Pro', 1, 1], ['Everyday Cotton Tee', 1, 2]], 'delivered', 'paid', 6 * D);
  mkOrder(ada, [['Ankara Print Shirt', 2, 1]], 'shipped', 'paid', 2 * D);
  const fresh = mkOrder(ada, [['Orbit Runner Sneakers', 1, 1]], 'delivered', 'paid', 4 * H);
  fresh.order.updatedAt = ago(3 * H);
  mkOrder(ada, [['Glow Vitamin C Serum', 0, 2]], 'pending', 'pending', 25 * 60_000);

  mkOrder(tunde, [['Nova X12 Smartphone', 1, 1]], 'delivered', 'paid', 12 * D);
  mkOrder(tunde, [['Zenith Chrono Watch', 0, 1], ['Everyday Cotton Tee', 0, 1]], 'delivered', 'paid', 9 * D);
  const tOrder = mkOrder(tunde, [['Nova Studio Headphones', 0, 1]], 'delivered', 'paid', 20 * H);
  tOrder.order.updatedAt = ago(10 * H);
  mkOrder(tunde, [['City Backpack', 0, 1]], 'processing', 'paid', 30 * H);
  const nOrder = mkOrder(ngozi, [['Air Fryer 7.5L', 0, 1]], 'pending', 'pending', 3 * H, 'BANK_TRANSFER');
  nOrder.payment.status = 'AWAITING_CONFIRMATION';
  nOrder.payment.receiptUrl = 'https://example.com/receipts/ngozi-transfer.jpg';
  nOrder.payment.bankName = 'Harlim Microfinance Bank'; nOrder.payment.accountName = 'Harlim ShopAll Ltd'; nOrder.payment.accountNumber = '0123456789';
  mkOrder(ngozi, [['Premium Bedding Set', 0, 1], ['Shea Butter Care Set', 1, 2]], 'delivered', 'paid', 16 * D);
  mkOrder(ngozi, [['Weekender Duffel Bag', 1, 1]], 'cancelled', 'failed', 7 * D);
  mkOrder(ibrahim, [['Zenith Book Air 14"', 0, 1]], 'processing', 'paid', 52 * H);
  mkOrder(ibrahim, [['Pulse Fit Band', 1, 1]], 'shipped', 'paid', 3 * D);
  mkOrder(ibrahim, [['Leather Loafers', 1, 1]], 'delivered', 'paid', 21 * D);

  const refund = (user: Rec, ord: { order: Rec; payment: Rec }, type: string, resolution: string, status: string, reason: string, agoMs: number) => {
    db.refunds.push({
      id: newId('rf'), order: ord.order._id, payment: ord.payment._id, user: user.id, type, resolution, reason, evidence: [], evidenceCount: 0,
      amount: type === 'CANCELLATION' ? Math.round(ord.order.total * 0.65) : ord.order.total, status, verificationNote: null, decisionNote: null, createdAt: ago(agoMs),
    });
  };
  const tOld = db.orders.find((o) => o.user === tunde.id && o.items[0].productName === 'Nova X12 Smartphone')!;
  refund(tunde, { order: tOld, payment: db.payments.find((p) => p.order === tOld._id)! }, 'DEFECT', 'REFUND', 'SUBMITTED', 'The phone will not charge past 40% and the screen flickers.', 5 * H);
  refund(tunde, { order: tOrder.order, payment: tOrder.payment }, 'DEFECT', 'REPLACEMENT', 'VERIFIED', 'Left ear cup has no sound.', 12 * H);
  db.refunds[db.refunds.length - 1].verificationNote = 'Evidence checked. Fault confirmed.';

  const note = (userId: string, type: string, title: string, message: string, link: string, agoMs: number, read = false) =>
    db.notifications.push({ _id: newId('nt'), recipient: userId, type, title, message, link, isRead: read, createdAt: ago(agoMs) });
  note(ada.id, 'USER_SIGNUP', 'Welcome to Harlim ShopAll', 'Welcome, Ada! Your account is ready.', '/shop', 40 * D, true);
  note(ada.id, 'ORDER_STATUS_CHANGED', 'Order shipped', 'Your order is on its way.', `/orders/${db.orders[1]._id}`, 2 * D, true);
  note(ada.id, 'ORDER_STATUS_CHANGED', 'Order delivered', 'Your sneakers were delivered. Not right? You have 24 hours to report a fault.', `/orders/${db.orders[2]._id}`, 3 * H);
  note(ada.id, 'ORDER_PLACED', 'Order placed', 'We received your order and are waiting for payment.', `/orders/${db.orders[3]._id}`, 25 * 60_000);
  [manager, admin, sup].forEach((s) => {
    note(s.id, 'NEW_ORDER', 'New order', 'A customer placed a new order.', '/admin/orders', 2 * H);
    note(s.id, 'REFUND_REQUESTED', 'Refund requested', 'A customer reported a faulty phone.', '/admin/refunds', 5 * H);
  });
  note(admin.id, 'TRANSFER_SUBMITTED', 'Bank transfer submitted', 'Ngozi submitted a transfer receipt for review.', '/admin/payments', 3 * H);

  const audit = (actor: Rec, action: string, target: Rec | null, details: Rec, agoMs: number) =>
    db.audit.push({ _id: newId('au'), actorId: actor.id, action, target, details, createdAt: ago(agoMs) });
  audit(manager, 'product.create', { type: 'product', id: db.products[0]._id }, { name: db.products[0].name }, 9 * D);
  audit(manager, 'product.update', { type: 'product', id: db.products[3]._id }, { fields: ['price'] }, 6 * D);
  audit(manager, 'order.status', { type: 'order', id: o1.order._id }, { from: 'shipped', to: 'delivered' }, 5 * D);
  audit(manager, 'variant.stock', { type: 'variant', id: db.variants[0]._id }, { stock: 20 }, 3 * D);
  audit(manager, 'product.delete', { type: 'product', id: newId('x') }, { name: 'Old stock item' }, 2 * D);
  audit(admin, 'user.deactivate', { type: 'user', id: ibrahim.id }, { reason: 'Chargeback dispute under review' }, 8 * D);
  audit(admin, 'user.activate', { type: 'user', id: ibrahim.id }, {}, 7 * D);
  audit(admin, 'payment.transfer_approve', { type: 'payment', id: db.payments[0]._id }, {}, 4 * D);
  audit(admin, 'user.view', { type: 'user', id: tunde.id }, {}, 1 * D);
  audit(sup, 'report.view', undefined as any, { report: 'staff-activity' }, 5 * H);
  seedReviews(db);
  const deals: [string, number][] = [['Nova X12 Smartphone', 2 * 24 + 5], ['City Backpack', 9], ['Orbit Runner Sneakers', 26]];
  for (const [name, hours] of deals) { const p = db.products.find((x) => x.name === name); if (p) p.dealEndsAt = new Date(Date.now() + hours * H).toISOString(); }
  return db;
}

const REVIEW_TEXT: [string, string, number, string, number][] = [
  ['ada@demo.shop', 'Nova X12 Smartphone', 5, 'Fast, the camera is excellent and the battery lasts all day. Delivery came a day early.', 9],
  ['tunde@demo.shop', 'Nova X12 Smartphone', 4, 'Very good phone. I wish the charger was in the box, but it does everything else well.', 7],
  ['ngozi@demo.shop', 'Nova X12 Smartphone', 5, '', 4],
  ['ibrahim@demo.shop', 'Nova X12 Smartphone', 3, 'Good value, though it heats up a little when gaming.', 3],
  ['ada@demo.shop', 'Orbit Runner Sneakers', 5, 'Light and comfortable from the first run. True to size.', 6],
  ['ngozi@demo.shop', 'Orbit Runner Sneakers', 4, 'Great cushioning. The white gets dirty quickly.', 5],
  ['tunde@demo.shop', 'Weekender Duffel Bag', 5, 'Holds a lot, and the shoe compartment is a smart touch.', 8],
  ['ada@demo.shop', 'Weekender Duffel Bag', 4, 'Sturdy canvas. The strap padding could be thicker.', 2],
  ['tunde@demo.shop', 'Nova Studio Headphones', 2, 'The left ear cup stopped working after two days.', 1],
  ['ngozi@demo.shop', 'Glow Vitamin C Serum', 5, 'My skin looks brighter after two weeks. No irritation.', 11],
  ['ibrahim@demo.shop', 'Air Fryer 7.5L', 4, 'Cooks evenly and cleans easily. A bit loud.', 10],
  ['ada@demo.shop', 'Zenith Chrono Watch', 5, 'Looks far more expensive than it is.', 12],
];

export function refreshRating(db: Db, productId: string) {
  const list = db.reviews.filter((r) => r.product === productId);
  const p = db.products.find((x) => x._id === productId);
  if (!p) return;
  p.ratingCount = list.length;
  p.ratingPositive = list.filter((r) => r.rating >= 4).length;
  p.ratingAverage = list.length ? Math.round((list.reduce((t, r) => t + r.rating, 0) / list.length) * 10) / 10 : 0;
}

export function seedReviews(db: Db) {
  db.reviews = [];
  for (const [email, productName, rating, comment, daysAgo] of REVIEW_TEXT) {
    const u = db.users.find((x) => x.email === email);
    const p = db.products.find((x) => x.name === productName);
    if (!u || !p) continue;
    db.reviews.push({ _id: newId('rv'), product: p._id, user: u.id, authorName: `${u.firstname} ${u.lastname}`, authorRole: 'customer', rating, comment, edited: false, replies: [], createdAt: ago(daysAgo * D), updatedAt: ago(daysAgo * D) });
  }
  const bad = db.reviews.find((r) => r.rating === 2);
  const mgr = db.users.find((u) => u.email === 'manager@demo.shop');
  if (bad && mgr) bad.replies.push({ _id: newId('rp'), user: mgr.id, authorName: `${mgr.firstname} ${mgr.lastname}`, authorRole: 'manager', text: 'Sorry about that. Please start a replacement request from your order page and we will sort it out.', createdAt: ago(20 * H) });
  db.products.forEach((p) => refreshRating(db, p._id));
}
