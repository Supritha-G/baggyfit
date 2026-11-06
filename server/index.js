const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const seed = require('./seed');

// ---------- config ----------
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG = {
  storeName: 'Baggy Fit',
  tagline: 'Own your look',
  whatsapp: process.env.WHATSAPP || '919999999999', // country code + number, no "+"
  email: process.env.STORE_EMAIL || 'hello@baggyfit.in',
  address: 'Baggy Fit, Karnataka, India',
  freeShipThreshold: 1499,
  shippingFee: 79,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
};
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const ONLINE_ENABLED = !!(CONFIG.razorpayKeyId && RZP_SECRET);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'public', 'uploads'), { recursive: true });

// ---------- tiny JSON database (atomic writes) ----------
let db;
function load() {
  if (fs.existsSync(DB_FILE)) { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return; }
  db = { products: seed.products, coupons: seed.coupons, users: [], orders: [], messages: [], subscribers: [], orderSeq: 1000 };
  const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.users.push({ id: 'u_admin', name: 'Admin', email: 'admin@baggyfit.in', phone: '', role: 'admin', pass: hashPw(adminPass), createdAt: Date.now() });
  save();
  console.log('\n  ┌─ Admin account created ───────────────────────');
  console.log('  │ email:    admin@baggyfit.in');
  console.log('  │ password: ' + adminPass + (process.env.ADMIN_PASSWORD ? '' : '   (change by deleting data/db.json and setting ADMIN_PASSWORD)'));
  console.log('  └───────────────────────────────────────────────\n');
}
function newCode() {
  let c; do { c = '2000' + String(++db.barcodeSeq).padStart(6, '0'); } while (allCodes().has(c));
  return c;
}
function allCodes() { const set = new Set(); db.products.forEach((p) => Object.values(p.barcodes || {}).forEach((c) => set.add(c))); return set; }
function ensureBarcodes() {
  db.barcodeSeq = db.barcodeSeq || 0; let changed = false;
  for (const p of db.products) {
    p.barcodes = p.barcodes || {};
    for (const sz of p.sizes) if (!p.barcodes[sz]) { p.barcodes[sz] = newCode(); changed = true; }
  }
  if (changed) save();
}
const stripP = ({ barcodes, ...rest }) => rest;
function findByCode(code) {
  code = String(code || '').trim();
  if (!code) return null;
  for (const p of db.products) for (const sz of p.sizes) if (p.barcodes && p.barcodes[sz] === code) return { p, size: sz };
  return null;
}
let saving = false, dirty = false;
function save() {
  if (saving) { dirty = true; return; }
  saving = true;
  const tmp = DB_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db, null, 2), (e) => {
    if (!e) fs.renameSync(tmp, DB_FILE);
    saving = false;
    if (dirty) { dirty = false; save(); }
  });
}

// ---------- auth helpers ----------
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(SECRET_FILE, 'utf8');

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const p = verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  req.user = p ? db.users.find((u) => u.id === p.id) || null : null;
  next();
}
const need = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in' }));
const needAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));

const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + req.path, now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    arr.push(now); hits.set(k, arr); next();
  };
}

const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
const clean = (s, n = 200) => String(s == null ? '' : s).trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s) => /^[6-9]\d{9}$/.test(s.replace(/[\s+-]/g, '').replace(/^91/, ''));
const normPhone = (s) => s.replace(/[\s+-]/g, '').replace(/^91(?=\d{10}$)/, '');

// ---------- app ----------
load();
ensureBarcodes();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(auth);
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', extensions: ['html'], setHeaders: (res, f) => { if (/\.(js|css|html)$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));

app.get('/api/config', (_req, res) => res.json({ ...CONFIG, onlinePayments: ONLINE_ENABLED }));

// ----- catalogue -----
app.get('/api/products', (_req, res) => res.json(db.products.filter((p) => p.active !== false).map(stripP)));
app.get('/api/products/:slug', (req, res) => {
  const p = db.products.find((x) => x.slug === req.params.slug && x.active !== false);
  p ? res.json(stripP(p)) : res.status(404).json({ error: 'Product not found' });
});

// ----- auth -----
app.post('/api/auth/register', limit(10, 6e5), (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email).toLowerCase(), pw = String(req.body.password || '');
  const phone = normPhone(clean(req.body.phone, 20));
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const u = { id: 'u_' + crypto.randomBytes(6).toString('hex'), name, email, phone, role: 'customer', pass: hashPw(pw), createdAt: Date.now() };
  db.users.push(u); save();
  res.json({ token: sign({ id: u.id }), user: pub(u) });
});
app.post('/api/auth/login', limit(10, 6e5), (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const u = db.users.find((x) => x.email === email);
  if (!u || !checkPw(String(req.body.password || ''), u.pass)) return res.status(401).json({ error: 'Incorrect email or password' });
  res.json({ token: sign({ id: u.id }), user: pub(u) });
});
app.get('/api/me', need, (req, res) => res.json(pub(req.user)));

// ----- pricing -----
function findCoupon(code) {
  return db.coupons.find((c) => c.active && c.code === clean(code, 30).toUpperCase());
}
function priceCart(items, couponCode) {
  const lines = [];
  for (const it of items || []) {
    const p = db.products.find((x) => x.id === it.id && x.active !== false);
    const qty = Math.floor(Number(it.qty));
    if (!p) throw new Error('A product in your cart is no longer available');
    if (!p.sizes.includes(it.size)) throw new Error(`Select a valid size for ${p.name}`);
    if (!(qty >= 1 && qty <= 10)) throw new Error('Invalid quantity');
    const avail = p.stock[it.size] || 0;
    if (qty > avail) throw new Error(avail ? `Only ${avail} left of ${p.name} in size ${it.size}` : `${p.name} (${it.size}) is sold out`);
    lines.push({ id: p.id, name: p.name, image: p.images[0], size: it.size, qty, price: p.price });
  }
  if (!lines.length) throw new Error('Your cart is empty');
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0, freeShip = false, coupon = null;
  if (couponCode) {
    const c = findCoupon(couponCode);
    if (!c) throw new Error('Invalid coupon code');
    if (subtotal < c.min) throw new Error(`Coupon ${c.code} needs a minimum order of ₹${c.min}`);
    coupon = c.code;
    if (c.type === 'percent') discount = Math.round((subtotal * c.value) / 100);
    else if (c.type === 'flat') discount = Math.min(c.value, subtotal);
    else freeShip = true;
  }
  const shipping = freeShip || subtotal - discount >= CONFIG.freeShipThreshold ? 0 : CONFIG.shippingFee;
  return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping, coupon };
}
app.post('/api/cart/price', (req, res) => {
  try { const { lines, ...t } = priceCart(req.body.items, req.body.coupon); res.json(t); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----- orders -----
function validAddress(a = {}) {
  const addr = {
    name: clean(a.name, 80), phone: normPhone(clean(a.phone, 20)), email: clean(a.email, 120).toLowerCase(),
    line1: clean(a.line1, 160), line2: clean(a.line2, 160), city: clean(a.city, 60), state: clean(a.state, 60), pincode: clean(a.pincode, 6),
  };
  if (addr.name.length < 2) throw new Error('Enter your full name');
  if (!isPhone(addr.phone)) throw new Error('Enter a valid 10-digit mobile number');
  if (addr.email && !isEmail(addr.email)) throw new Error('Enter a valid email');
  if (addr.line1.length < 5) throw new Error('Enter your address');
  if (!addr.city || !addr.state) throw new Error('Enter city and state');
  if (!/^\d{6}$/.test(addr.pincode)) throw new Error('Enter a valid 6-digit PIN code');
  return addr;
}
function commitStock(order) {
  for (const l of order.items) {
    const p = db.products.find((x) => x.id === l.id);
    if (p) p.stock[l.size] = Math.max(0, (p.stock[l.size] || 0) - l.qty);
  }
}
function pushStatus(o, status, note = '') { o.status = status; o.timeline.push({ status, at: Date.now(), note }); }

app.post('/api/orders', limit(20, 6e5), async (req, res) => {
  try {
    const address = validAddress(req.body.address);
    const method = req.body.payment === 'online' ? 'online' : 'cod';
    if (method === 'online' && !ONLINE_ENABLED) throw new Error('Online payment is not available right now. Please choose Cash on Delivery.');
    const priced = priceCart(req.body.items, req.body.coupon);
    const id = 'BF' + ++db.orderSeq;
    const order = {
      id, userId: req.user ? req.user.id : null, items: priced.lines, address,
      subtotal: priced.subtotal, discount: priced.discount, shipping: priced.shipping, total: priced.total, coupon: priced.coupon,
      payment: { method, status: 'pending' }, status: 'pending', timeline: [], notes: clean(req.body.notes, 300), createdAt: Date.now(),
    };
    if (method === 'cod') {
      pushStatus(order, 'confirmed', 'Order placed — pay on delivery');
      commitStock(order);
    } else {
      pushStatus(order, 'awaiting_payment', 'Waiting for payment');
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(CONFIG.razorpayKeyId + ':' + RZP_SECRET).toString('base64') },
        body: JSON.stringify({ amount: order.total * 100, currency: 'INR', receipt: id }),
      });
      if (!r.ok) throw new Error('Could not start payment. Please try again.');
      order.payment.rzpOrderId = (await r.json()).id;
    }
    db.orders.push(order); save();
    res.json({ order: publicOrder(order), rzp: method === 'online' ? { key: CONFIG.razorpayKeyId, orderId: order.payment.rzpOrderId, amount: order.total * 100 } : null });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/payments/verify', (req, res) => {
  const o = db.orders.find((x) => x.id === req.body.orderId);
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
  if (!o || !oid || !pid || !sig || o.payment.rzpOrderId !== oid) return res.status(400).json({ error: 'Invalid payment' });
  const exp = crypto.createHmac('sha256', RZP_SECRET).update(oid + '|' + pid).digest('hex');
  if (exp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return res.status(400).json({ error: 'Payment verification failed' });
  if (o.payment.status !== 'paid') {
    o.payment.status = 'paid'; o.payment.paymentId = pid;
    pushStatus(o, 'confirmed', 'Payment received'); commitStock(o); save();
  }
  res.json({ order: publicOrder(o) });
});
const publicOrder = (o) => ({ id: o.id, items: o.items, address: o.address, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, coupon: o.coupon, payment: { method: o.payment.method, status: o.payment.status }, status: o.status, timeline: o.timeline, tracking: o.tracking || null, createdAt: o.createdAt });

app.get('/api/orders/track', limit(30, 6e5), (req, res) => {
  const id = clean(req.query.id, 20).toUpperCase(), phone = normPhone(clean(req.query.phone, 20));
  const o = db.orders.find((x) => x.id === id && x.address.phone === phone);
  o ? res.json(publicOrder(o)) : res.status(404).json({ error: 'No order found with those details' });
});
app.get('/api/my/orders', need, (req, res) => res.json(db.orders.filter((o) => o.userId === req.user.id).reverse().map(publicOrder)));

// ----- coupons, contact, newsletter -----
app.post('/api/coupon/validate', (req, res) => {
  try { const t = priceCart(req.body.items, req.body.coupon); res.json({ coupon: t.coupon, discount: t.discount, shipping: t.shipping, total: t.total }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/contact', limit(5, 6e5), (req, res) => {
  const m = { id: 'm_' + crypto.randomBytes(4).toString('hex'), name: clean(req.body.name, 80), email: clean(req.body.email, 120), message: clean(req.body.message, 1500), createdAt: Date.now() };
  if (m.name.length < 2 || !isEmail(m.email) || m.message.length < 5) return res.status(400).json({ error: 'Please fill in all fields correctly' });
  db.messages.push(m); save(); res.json({ ok: true });
});
app.post('/api/subscribe', limit(5, 6e5), (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (!db.subscribers.includes(email)) { db.subscribers.push(email); save(); }
  res.json({ ok: true });
});

// ----- admin -----
const admin = express.Router();
admin.use(need, needAdmin);
admin.get('/stats', (_req, res) => {
  const live = db.orders.filter((o) => !['cancelled', 'awaiting_payment'].includes(o.status));
  const day = Date.now() - 864e5;
  res.json({
    revenue: live.reduce((s, o) => s + o.total, 0), orders: live.length, today: live.filter((o) => o.createdAt > day).length,
    pending: live.filter((o) => ['confirmed', 'packed'].includes(o.status)).length, customers: db.users.filter((u) => u.role === 'customer').length,
    lowStock: db.products.flatMap((p) => p.sizes.filter((s) => (p.stock[s] || 0) <= 2).map((s) => ({ name: p.name, size: s, left: p.stock[s] || 0 }))).slice(0, 12),
    messages: db.messages.length,
  });
});
admin.get('/orders', (_req, res) => res.json([...db.orders].reverse()));
const STATUSES = ['confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
admin.patch('/orders/:id', (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const { status, courier, trackingId } = req.body;
  if (courier !== undefined || trackingId !== undefined) o.tracking = { courier: clean(courier, 60), id: clean(trackingId, 60) };
  if (status && status !== o.status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (status === 'cancelled' && o.status !== 'cancelled' && o.status !== 'awaiting_payment') {
      for (const l of o.items) { const p = db.products.find((x) => x.id === l.id); if (p) p.stock[l.size] = (p.stock[l.size] || 0) + l.qty; }
    }
    if (status === 'delivered' && o.payment.method === 'cod') o.payment.status = 'paid';
    pushStatus(o, status, clean(req.body.note, 200));
  }
  save(); res.json(o);
});
admin.get('/products', (_req, res) => res.json(db.products));
function productFrom(b, existing = {}) {
  const sizes = Array.isArray(b.sizes) && b.sizes.length ? b.sizes.map(String) : seed.SIZES;
  const stock = {}; sizes.forEach((s) => { stock[s] = Math.max(0, parseInt((b.stock || {})[s], 10) || 0); });
  const name = clean(b.name, 120);
  if (!name) throw new Error('Name is required');
  const price = parseInt(b.price, 10), mrp = parseInt(b.mrp, 10) || price;
  if (!(price > 0)) throw new Error('Enter a valid price');
  const images = (Array.isArray(b.images) ? b.images : []).map((s) => clean(s, 300)).filter((s) => s.startsWith('/img/') || s.startsWith('/uploads/'));
  if (!images.length) throw new Error('Add at least one image');
  const barcodes = {};
  const used = new Set(); db.products.forEach((q) => { if (q.id !== existing.id) Object.values(q.barcodes || {}).forEach((c) => used.add(c)); });
  for (const sz of sizes) {
    const c = clean((b.barcodes || {})[sz] || (existing.barcodes || {})[sz], 40);
    if (c && used.has(c)) throw new Error(`Barcode ${c} is already used by another item`);
    if (c) { barcodes[sz] = c; used.add(c); }
  }
  for (const sz of sizes) if (!barcodes[sz]) { barcodes[sz] = newCode(); used.add(barcodes[sz]); }
  return {
    ...existing, barcodes, name, category: ['tees', 'polos', 'sweatshirts', 'jackets', 'jeans', 'accessories'].includes(b.category) ? b.category : 'tees',
    price, mrp, color: clean(b.color, 40), tag: clean(b.tag, 20), images, sizes, stock,
    description: clean(b.description, 1000), details: (Array.isArray(b.details) ? b.details : []).map((d) => clean(d, 120)).filter(Boolean).slice(0, 8),
    featured: !!b.featured, active: b.active !== false,
  };
}
admin.post('/products', (req, res) => {
  try {
    const base = clean(req.body.name, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
    let slug = base, i = 2; while (db.products.some((p) => p.slug === slug)) slug = base + '-' + i++;
    const p = productFrom(req.body, { id: slug, slug, createdAt: Date.now() });
    db.products.push(p); save(); res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
admin.put('/products/:id', (req, res) => {
  const i = db.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  try { db.products[i] = productFrom(req.body, db.products[i]); save(); res.json(db.products[i]); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
admin.delete('/products/:id', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.active = false; save(); res.json({ ok: true }); // soft delete keeps past orders intact
});

admin.get('/lookup', (req, res) => {
  const f = findByCode(req.query.code);
  if (!f) return res.status(404).json({ error: 'Barcode not found: ' + clean(req.query.code, 40) });
  res.json({ id: f.p.id, name: f.p.name, size: f.size, price: f.p.price, image: f.p.images[0], stock: f.p.stock[f.size] || 0, barcode: f.p.barcodes[f.size] });
});
admin.get('/search', (req, res) => {
  const q = clean(req.query.q, 40).toLowerCase(); if (!q) return res.json([]);
  const out = [];
  for (const p of db.products) { if (p.active === false || !(p.name + ' ' + p.color).toLowerCase().includes(q)) continue; for (const sz of p.sizes) out.push({ id: p.id, name: p.name, size: sz, price: p.price, image: p.images[0], stock: p.stock[sz] || 0, barcode: p.barcodes[sz] }); }
  res.json(out.slice(0, 30));
});
admin.get('/inventory', (_req, res) => res.json(db.products.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, image: p.images[0], price: p.price, sizes: p.sizes.map((s) => ({ size: s, qty: p.stock[s] || 0, barcode: p.barcodes[s] })) }))));
admin.post('/stock', (req, res) => {
  const p = db.products.find((x) => x.id === req.body.id); const qty = parseInt(req.body.qty, 10);
  if (!p || !p.sizes.includes(req.body.size) || !(qty >= 0)) return res.status(400).json({ error: 'Invalid stock update' });
  p.stock[req.body.size] = qty; save(); res.json({ ok: true });
});
admin.post('/stock-in', (req, res) => {
  const f = findByCode(req.body.barcode); const qty = Math.max(1, parseInt(req.body.qty, 10) || 1);
  if (!f) return res.status(404).json({ error: 'Barcode not found' });
  f.p.stock[f.size] = (f.p.stock[f.size] || 0) + qty; save();
  res.json({ name: f.p.name, size: f.size, stock: f.p.stock[f.size] });
});
admin.post('/pos/sale', (req, res) => {
  try {
    const lines = [];
    for (const it of req.body.items || []) {
      const p = db.products.find((x) => x.id === it.id); const qty = Math.floor(Number(it.qty));
      if (!p || !p.sizes.includes(it.size) || !(qty >= 1)) throw new Error('Invalid item in bill');
      const have = p.stock[it.size] || 0;
      if (qty > have) throw new Error(`${p.name} (${it.size}): only ${have} in stock`);
      const price = it.price !== undefined && Number(it.price) >= 0 ? Math.round(Number(it.price)) : p.price; // cashier may override price
      lines.push({ id: p.id, name: p.name, image: p.images[0], size: it.size, qty, price });
    }
    if (!lines.length) throw new Error('Bill is empty');
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const d = req.body.discount || {}; const dv = Math.max(0, Number(d.value) || 0);
    const discount = Math.min(subtotal, d.type === 'percent' ? Math.round((subtotal * Math.min(dv, 100)) / 100) : Math.round(dv));
    const mode = ['cash', 'upi', 'card'].includes(req.body.payment) ? req.body.payment : 'cash';
    const c = req.body.customer || {};
    const order = {
      id: 'ST' + ++db.orderSeq, source: 'store', userId: null, items: lines,
      address: { name: clean(c.name, 80) || 'Walk-in customer', phone: normPhone(clean(c.phone, 20)), email: '', line1: 'In-store sale', line2: '', city: '', state: '', pincode: '' },
      subtotal, discount, shipping: 0, total: subtotal - discount, coupon: null,
      payment: { method: mode, status: 'paid' }, status: 'delivered', timeline: [], notes: '', createdAt: Date.now(),
    };
    pushStatus(order, 'delivered', 'In-store sale (' + mode + ')');
    commitStock(order); db.orders.push(order); save();
    res.json(order);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
admin.post('/upload', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' }), (req, res) => {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Upload a JPG, PNG or WebP image' });
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(ROOT, 'public', 'uploads', name), req.body);
  res.json({ url: '/uploads/' + name });
});
admin.get('/images', (_req, res) => res.json(fs.readdirSync(path.join(ROOT, 'public', 'img')).filter((f) => /\.(jpe?g|png|webp)$/.test(f)).map((f) => '/img/' + f)));
admin.get('/coupons', (_req, res) => res.json(db.coupons));
admin.post('/coupons', (req, res) => {
  const code = clean(req.body.code, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const type = ['percent', 'flat', 'ship'].includes(req.body.type) ? req.body.type : 'percent';
  if (!code) return res.status(400).json({ error: 'Enter a code' });
  const c = { code, type, value: Math.max(0, parseInt(req.body.value, 10) || 0), min: Math.max(0, parseInt(req.body.min, 10) || 0), active: req.body.active !== false, note: clean(req.body.note, 100) };
  const i = db.coupons.findIndex((x) => x.code === code);
  i >= 0 ? (db.coupons[i] = c) : db.coupons.push(c); save(); res.json(c);
});
admin.delete('/coupons/:code', (req, res) => { db.coupons = db.coupons.filter((c) => c.code !== req.params.code); save(); res.json({ ok: true }); });
admin.get('/messages', (_req, res) => res.json([...db.messages].reverse()));
app.use('/api/admin', admin);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// SPA fallback
app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(ROOT, 'public', 'index.html')) : next()));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Something went wrong' }); });

app.listen(PORT, () => console.log(`Baggy Fit running → http://localhost:${PORT}`));
