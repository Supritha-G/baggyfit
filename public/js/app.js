(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const S = { cfg: null, products: null, cart: store.get('bf_cart', []), wish: store.get('bf_wish', []), token: store.get('bf_token', null), user: store.get('bf_user', null), coupon: store.get('bf_coupon', '') };

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let body = opts.body;
  if (body && typeof body === 'object' && !(body instanceof Blob)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const r = await fetch('/api' + path, { ...opts, headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && S.token && !path.startsWith('/auth')) logout(true); throw new Error(data.error || 'Request failed'); }
  return data;
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
window.BF = { $, $$, esc, money, api, toast, S, store };

// ---------- data ----------
async function products() { if (!S.products) S.products = await api('/products'); return S.products; }
const inStock = (p) => p.sizes.some((s) => (p.stock[s] || 0) > 0);
const off = (p) => (p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0);
const CATS = { tees: 'Oversized Tees', polos: 'Polos', sweatshirts: 'Sweatshirts', jackets: 'Denim Jackets', jeans: 'Jeans', accessories: 'Accessories' };

// ---------- cart ----------
const saveCart = () => { store.set('bf_cart', S.cart); renderCartCount(); };
const lineKey = (l) => l.id + '|' + l.size;
async function addToCart(id, size, qty = 1) {
  const p = (await products()).find((x) => x.id === id);
  const avail = p.stock[size] || 0;
  const ex = S.cart.find((l) => l.id === id && l.size === size);
  const want = (ex ? ex.qty : 0) + qty;
  if (want > avail) return toast(avail ? `Only ${avail} available in size ${size}` : 'Sorry, that size is sold out');
  ex ? (ex.qty = want) : S.cart.push({ id, size, qty });
  saveCart(); openCart();
}
function renderCartCount() {
  const n = S.cart.reduce((s, l) => s + l.qty, 0), b = $('#cartCount');
  b.hidden = !n; b.textContent = n;
  const w = $('#wishCount'); w.hidden = !S.wish.length; w.textContent = S.wish.length;
}
async function cartDetail() {
  const ps = await products(); const lines = [];
  S.cart = S.cart.filter((l) => ps.some((p) => p.id === l.id));
  for (const l of S.cart) { const p = ps.find((x) => x.id === l.id); lines.push({ ...l, p, avail: p.stock[l.size] || 0 }); }
  return lines;
}
async function renderDrawer() {
  const lines = await cartDetail();
  const sub = lines.reduce((s, l) => s + l.p.price * l.qty, 0), th = S.cfg.freeShipThreshold;
  const body = $('#drawerBody'), foot = $('#drawerFoot');
  if (!lines.length) {
    body.innerHTML = `<div class="empty"><p style="font-size:44px">🛍️</p><p>Your cart is empty.</p><p style="margin-top:16px"><a class="btn sm" href="/shop" data-link>Start shopping</a></p></div>`;
    foot.innerHTML = ''; return;
  }
  const left = th - sub;
  body.innerHTML = `<div class="ship-bar" style="margin:0 -20px">${left > 0 ? `Add <b>${money(left)}</b> more for <b>free shipping</b>` : '🎉 You\'ve unlocked <b>free shipping</b>'}<div class="bar"><i style="width:${Math.min(100, (sub / th) * 100)}%"></i></div></div>` +
    lines.map((l) => `<div class="line"><a href="/product/${esc(l.p.slug)}" data-link><img src="${esc(l.p.images[0])}" alt="" loading="lazy"></a><div><h4>${esc(l.p.name)}</h4><div class="meta">Size ${esc(l.size)} · ${esc(l.p.color)}</div><div class="row"><div class="qty"><button data-dec="${esc(lineKey(l))}" aria-label="Decrease">−</button><span>${l.qty}</span><button data-inc="${esc(lineKey(l))}" aria-label="Increase">+</button></div><b>${money(l.p.price * l.qty)}</b></div><button class="rm" data-rm="${esc(lineKey(l))}">Remove</button></div></div>`).join('');
  foot.innerHTML = `<div class="sum-row total"><span>Subtotal</span><span>${money(sub)}</span></div><p class="muted" style="font-size:13px;margin:4px 0 14px">Shipping & discounts calculated at checkout.</p><a class="btn accent block" href="/checkout" data-link>Checkout</a>`;
}
function openCart() { renderDrawer(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#overlay').hidden = false; }
function closeAll() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#overlay').hidden = true; $('#nav').classList.remove('open'); }
$('#cartBtn').onclick = openCart; $('#closeCart').onclick = closeAll; $('#overlay').onclick = closeAll;
$('#menuBtn').onclick = () => { $('#nav').classList.add('open'); $('#overlay').hidden = false; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); $$('.modal').forEach((m) => m.remove()); } });
$('#drawerBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-inc],[data-dec],[data-rm]'); if (!t) return;
  const key = t.dataset.inc || t.dataset.dec || t.dataset.rm; const l = S.cart.find((x) => lineKey(x) === key); if (!l) return;
  if (t.dataset.inc) { const p = S.products.find((x) => x.id === l.id); if (l.qty + 1 > (p.stock[l.size] || 0)) return toast('No more stock in this size'); l.qty++; }
  else if (t.dataset.dec) l.qty--; else l.qty = 0;
  S.cart = S.cart.filter((x) => x.qty > 0); saveCart(); renderDrawer();
});

// ---------- wishlist ----------
function toggleWish(id) { S.wish = S.wish.includes(id) ? S.wish.filter((x) => x !== id) : [...S.wish, id]; store.set('bf_wish', S.wish); renderCartCount(); }
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-wish]'); if (!w) return; e.preventDefault(); e.stopPropagation();
  toggleWish(w.dataset.wish); w.classList.toggle('on', S.wish.includes(w.dataset.wish)); toast(S.wish.includes(w.dataset.wish) ? 'Saved to wishlist' : 'Removed from wishlist');
  if (location.pathname === '/wishlist') route();
});

// ---------- components ----------
const heart = (id) => `<button class="wish ${S.wish.includes(id) ? 'on' : ''}" data-wish="${esc(id)}" aria-label="Toggle wishlist"><svg viewBox="0 0 24 24" stroke-linejoin="round"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z"/></svg></button>`;
function card(p) {
  const o = off(p), sold = !inStock(p);
  return `<article class="card"><a class="card-img" href="/product/${esc(p.slug)}" data-link aria-label="${esc(p.name)}">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}${sold ? '<span class="tag out">Sold out</span>' : o ? `<span class="tag sale">${o}% off</span>` : ''}<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">${p.images[1] ? `<img class="alt" src="${esc(p.images[1])}" alt="" loading="lazy">` : ''}</a>${heart(p.id)}<div class="card-body"><h3><a href="/product/${esc(p.slug)}" data-link>${esc(p.name)}</a></h3><div class="cl">${esc(p.color)}</div><div class="price">${money(p.price)} ${p.mrp > p.price ? `<s>${money(p.mrp)}</s>` : ''}</div></div></article>`;
}
const icons = {
  truck: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  swap: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
};

// ---------- pages ----------
const view = $('#main');
const pages = {};

pages.home = async () => {
  const ps = await products();
  const feat = ps.filter((p) => p.featured).slice(0, 8);
  const count = (c) => ps.filter((p) => p.category === c).length;
  const m = ['New drops weekly', 'Oversized fits', 'Free shipping above ₹1,499', 'Cash on delivery', 'Own your look'].map((t) => `<span>${t}</span><span>✦</span>`).join('');
  return `
  <section class="hero"><div class="hero-bg"><img src="/img/tees-pile.jpg" alt=""></div><div class="hero-in"><div class="eyebrow">New collection · Racing graphics</div><h1>Own your<br><em>look.</em></h1><p>Heavyweight oversized tees, polos, sweatshirts and denim — cut loose, built to last, shipped across India.</p><div class="cta"><a class="btn accent" href="/shop" data-link>Shop the drop</a><a class="btn ghost" href="/shop?cat=tees" data-link>Oversized tees</a></div></div></section>
  <div class="marquee" aria-hidden="true"><div>${m}${m}${m}${m}</div></div>
  <section class="section"><div class="wrap"><div class="sec-head"><h2>Shop by category</h2><a class="link-u" href="/shop" data-link>View all</a></div><div class="cats">
    ${[['tees', 'tee-papaya'], ['polos', 'polo-set'], ['sweatshirts', 'sweat-navy'], ['jackets', 'jackets']].map(([c, i]) => `<a class="cat" href="/shop?cat=${c}" data-link><img src="/img/${i}.jpg" alt="" loading="lazy"><span>${CATS[c]}<small>${count(c)} ${count(c) === 1 ? 'style' : 'styles'}</small></span></a>`).join('')}
  </div></div></section>
  <section class="section" style="padding-top:0"><div class="wrap"><div class="sec-head"><h2>Trending now</h2><a class="link-u" href="/shop" data-link>Shop everything</a></div><div class="grid">${feat.map(card).join('')}</div></div></section>
  <section class="section dark"><div class="wrap store"><div><div class="eyebrow">Visit the store</div><h2>Feel the fabric.<br>Find your fit.</h2><p>Walk into our store to try the full range — stacked tees, polos in every colour, sweatshirts and denim. Can't make it? We ship everywhere in India.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn accent" href="/about" data-link>Our story</a><a class="btn ghost" href="/contact" data-link>Get directions</a></div></div><div class="store-imgs"><img class="a" src="/img/store-tall.jpg" alt="Inside the Baggy Fit store" loading="lazy"><img class="b" src="/img/storefront.jpg" alt="Baggy Fit storefront" loading="lazy"><img class="b" src="/img/shelf-wide.jpg" alt="Folded tees on shelves" loading="lazy"></div></div></section>
  <section class="section"><div class="wrap props">
    <div class="prop"><div class="ico">${icons.truck}</div><b>Free shipping</b><p>On all orders above ${money(S.cfg.freeShipThreshold)}. Delivered in 3–7 days.</p></div>
    <div class="prop"><div class="ico">${icons.cash}</div><b>Cash on delivery</b><p>Pay when it arrives. Try before you commit.</p></div>
    <div class="prop"><div class="ico">${icons.swap}</div><b>7-day exchange</b><p>Wrong size? Swap it, hassle-free.</p></div>
    <div class="prop"><div class="ico">${icons.shield}</div><b>Quality checked</b><p>Heavyweight fabric, clean stitching, every piece.</p></div>
  </div></section>`;
};

pages.shop = async (q) => {
  const ps = await products();
  const cat = q.get('cat') || '', sort = q.get('sort') || 'new', term = (q.get('q') || '').toLowerCase().trim();
  let list = ps.filter((p) => (!cat || p.category === cat) && (!term || (p.name + ' ' + p.color + ' ' + p.category + ' ' + p.description).toLowerCase().includes(term)));
  const sorters = { new: (a, b) => b.createdAt - a.createdAt, low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, off: (a, b) => off(b) - off(a) };
  list.sort(sorters[sort] || sorters.new);
  const cats = [...new Set(ps.map((p) => p.category))];
  const url = (o) => { const n = new URLSearchParams({ cat, sort, q: term, ...o }); [...n].forEach(([k, v]) => !v && n.delete(k)); return '/shop' + (n.toString() ? '?' + n : ''); };
  return `<div class="wrap"><div class="page-title"><h1>${term ? `Results for “${esc(term)}”` : esc(CATS[cat] || 'All products')}</h1><p class="muted">${list.length} product${list.length === 1 ? '' : 's'}</p></div>
  <div class="toolbar"><div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="${url({ cat: '' })}" data-link>All</a>${cats.map((c) => `<a class="chip ${cat === c ? 'on' : ''}" href="${url({ cat: c })}" data-link>${esc(CATS[c] || c)}</a>`).join('')}</div>
  <label>Sort <select class="sel" id="sortSel" aria-label="Sort products">${[['new', 'Newest'], ['low', 'Price: low to high'], ['high', 'Price: high to low'], ['off', 'Biggest discount']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  ${list.length ? `<div class="grid" style="padding-bottom:70px">${list.map(card).join('')}</div>` : `<div class="empty"><h2>Nothing found</h2><p>Try a different search or <a class="link-u" href="/shop" data-link>browse everything</a>.</p></div>`}</div>`;
};
document.addEventListener('change', (e) => { if (e.target.id === 'sortSel') { const q = new URLSearchParams(location.search); q.set('sort', e.target.value); go('/shop?' + q); } });

pages.product = async (_q, slug) => {
  const ps = await products(); const p = ps.find((x) => x.slug === slug);
  if (!p) return notFound();
  document.title = `${p.name} — Baggy Fit`;
  const o = off(p), first = p.sizes.find((s) => (p.stock[s] || 0) > 0);
  const related = ps.filter((x) => x.id !== p.id && x.category === p.category).concat(ps.filter((x) => x.category !== p.category)).slice(0, 4);
  view.dataset.pid = p.id;
  return `<div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / <a href="/shop?cat=${esc(p.category)}" data-link>${esc(CATS[p.category] || p.category)}</a> / ${esc(p.name)}</div>
  <div class="pdp"><div class="gallery"><div class="thumbs">${p.images.map((im, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(im)}" aria-label="View image ${i + 1}"><img src="${esc(im)}" alt=""></button>`).join('')}</div><div class="main-img"><img id="mainImg" src="${esc(p.images[0])}" alt="${esc(p.name)}"></div></div>
  <div><h1>${esc(p.name)}</h1><div class="price">${money(p.price)} ${p.mrp > p.price ? `<s>${money(p.mrp)}</s><span class="off">${o}% off</span>` : ''}</div><div class="tax">Inclusive of all taxes. Colour: ${esc(p.color)}</div>
  <div class="opt-label"><span>Size</span><button data-sizeguide>Size guide</button></div>
  <div class="sizes" id="sizes" role="radiogroup" aria-label="Size">${p.sizes.map((s) => `<button class="size" role="radio" data-size="${esc(s)}" ${(p.stock[s] || 0) < 1 ? 'disabled' : ''} aria-checked="false">${esc(s)}</button>`).join('')}</div>
  <div class="stock-note" id="stockNote"></div>
  <div class="opt-label"><span>Quantity</span></div><div class="qty" id="pdpQty"><button data-q="-1" aria-label="Decrease">−</button><span id="qv">1</span><button data-q="1" aria-label="Increase">+</button></div>
  <div class="buy"><button class="btn accent" id="addBtn" ${first ? '' : 'disabled'}>${first ? 'Add to cart' : 'Sold out'}</button>${heart(p.id)}</div>
  <div class="perks"><div>${icons.truck} Free shipping above ${money(S.cfg.freeShipThreshold)}</div><div>${icons.cash} Cash on delivery</div><div>${icons.swap} 7-day exchange</div><div>${icons.shield} Quality checked</div></div>
  <div class="acc"><details open><summary>Description</summary><p>${esc(p.description)}</p></details><details><summary>Details & care</summary><ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details><details><summary>Shipping & exchange</summary><p>Orders ship within 24–48 hours and arrive in 3–7 business days. Not the right fit? Exchange within 7 days of delivery — unworn, with tags.</p></details></div></div></div>
  <section style="padding-bottom:70px"><div class="sec-head"><h2>You may also like</h2></div><div class="grid">${related.map(card).join('')}</div></section></div>`;
};
let pdp = { size: null, qty: 1 };
document.addEventListener('click', async (e) => {
  if (!view.dataset.pid) return;
  const t = e.target;
  const th = t.closest('[data-img]'); if (th) { $('#mainImg').src = th.dataset.img; $$('.thumbs button').forEach((b) => b.classList.toggle('on', b === th)); }
  const sz = t.closest('[data-size]');
  if (sz && !sz.disabled) {
    pdp.size = sz.dataset.size; pdp.qty = 1; $('#qv').textContent = 1;
    $$('.size').forEach((b) => { b.classList.toggle('on', b === sz); b.setAttribute('aria-checked', b === sz); });
    const p = S.products.find((x) => x.id === view.dataset.pid), n = p.stock[pdp.size] || 0;
    $('#stockNote').textContent = n <= 3 ? `Only ${n} left in size ${pdp.size}` : '';
  }
  const q = t.closest('[data-q]');
  if (q) { const p = S.products.find((x) => x.id === view.dataset.pid), max = pdp.size ? Math.min(10, p.stock[pdp.size]) : 10; pdp.qty = Math.min(max, Math.max(1, pdp.qty + +q.dataset.q)); $('#qv').textContent = pdp.qty; }
  if (t.closest('#addBtn')) { if (!pdp.size) { $('#stockNote').textContent = 'Please select a size'; $('#sizes').animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; } addToCart(view.dataset.pid, pdp.size, pdp.qty); }
  if (t.closest('[data-sizeguide]')) sizeGuide();
});
function sizeGuide() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box" role="dialog" aria-label="Size guide"><div style="display:flex;justify-content:space-between"><h3>Size guide</h3><button class="icon-btn" aria-label="Close" style="color:#000">✕</button></div><p class="muted" style="margin-bottom:14px">Our tees and sweatshirts are cut oversized. Take your usual size for the intended baggy look, or size down for a regular fit. Measurements in inches.</p>${sizeTable()}</div>`;
  m.onclick = (e) => { if (e.target === m || e.target.closest('.icon-btn')) m.remove(); }; document.body.append(m);
}
const sizeTable = () => `<div class="scroll-x"><table class="tbl"><tr><th>Size</th><th>Chest</th><th>Length</th><th>Shoulder</th></tr>${[['S', 42, 27, 19], ['M', 44, 28, 20], ['L', 46, 29, 21], ['XL', 48, 30, 22], ['XXL', 50, 31, 23]].map((r) => `<tr>${r.map((c, i) => `<td>${i ? c + '"' : '<b>' + c + '</b>'}</td>`).join('')}</tr>`).join('')}</table></div>`;

pages.wishlist = async () => {
  const ps = (await products()).filter((p) => S.wish.includes(p.id));
  return `<div class="wrap"><div class="page-title"><h1>Wishlist</h1></div>${ps.length ? `<div class="grid" style="padding:20px 0 70px">${ps.map(card).join('')}</div>` : `<div class="empty"><p>Nothing saved yet.</p><p style="margin-top:14px"><a class="btn sm" href="/shop" data-link>Browse products</a></p></div>`}</div>`;
};

// ----- checkout -----
let priceState = null;
pages.checkout = async () => {
  const lines = await cartDetail();
  if (!lines.length) return `<div class="center"><h2>Your cart is empty</h2><p class="muted" style="margin:10px 0 20px">Add something you love first.</p><a class="btn" href="/shop" data-link>Shop now</a></div>`;
  const u = S.user || {}, saved = store.get('bf_addr', {});
  const f = (id, label, val = '', extra = '') => `<div class="field ${extra}"><label for="${id}">${label}</label><input id="${id}" name="${id}" value="${esc(val)}" ${id === 'email' || id === 'line2' ? '' : 'required'} autocomplete="${{ name: 'name', phone: 'tel', email: 'email', line1: 'address-line1', line2: 'address-line2', city: 'address-level2', state: 'address-level1', pincode: 'postal-code' }[id]}"></div>`;
  return `<div class="wrap"><div class="page-title"><h1>Checkout</h1></div><form class="checkout" id="coForm" novalidate>
  <div><div class="box"><h3>Contact & delivery</h3>${!S.user ? '<p class="muted" style="margin:-6px 0 14px;font-size:14px">Have an account? <a class="link-u" href="/account?next=/checkout" data-link>Sign in</a> or continue as guest.</p>' : ''}
  <div class="fgrid">${f('name', 'Full name', saved.name || u.name, 'full')}${f('phone', 'Mobile number', saved.phone || u.phone)}${f('email', 'Email (for order updates)', saved.email || u.email)}${f('line1', 'Address (house no., street)', saved.line1, 'full')}${f('line2', 'Landmark / area (optional)', saved.line2, 'full')}${f('city', 'City', saved.city)}${f('state', 'State', saved.state)}${f('pincode', 'PIN code', saved.pincode)}</div></div>
  <div class="box"><h3>Payment</h3><label class="pay on" id="payCod"><input type="radio" name="pay" value="cod" checked><span><b>Cash on delivery</b><small>Pay in cash or UPI when your order arrives.</small></span></label>
  <label class="pay" ${S.cfg.onlinePayments ? '' : 'aria-disabled="true"'} id="payOnl"><input type="radio" name="pay" value="online" ${S.cfg.onlinePayments ? '' : 'disabled'}><span><b>UPI / Card / Netbanking</b><small>${S.cfg.onlinePayments ? 'Secure online payment via Razorpay.' : 'Coming soon.'}</small></span></label>
  <div class="field" style="margin-top:14px"><label for="notes">Order notes (optional)</label><textarea id="notes" rows="2" maxlength="300" placeholder="e.g. preferred colour, delivery instructions"></textarea></div></div></div>
  <aside class="summary box" id="summary"></aside></form></div>`;
};
async function renderSummary() {
  const el = $('#summary'); if (!el) return;
  const lines = await cartDetail();
  let t = { subtotal: lines.reduce((s, l) => s + l.p.price * l.qty, 0), discount: 0, shipping: 0, total: 0 }, err = '';
  try { t = await api('/cart/price', { method: 'POST', body: { items: S.cart, coupon: S.coupon } }); }
  catch (e) { err = e.message; if (S.coupon && /oupon/.test(err)) { S.coupon = ''; store.del('bf_coupon'); try { t = await api('/cart/price', { method: 'POST', body: { items: S.cart } }); } catch {} } }
  priceState = t;
  el.innerHTML = `<h3>Order summary</h3>${lines.map((l) => `<div class="line"><img src="${esc(l.p.images[0])}" alt=""><div><h4>${esc(l.p.name)}</h4><div class="meta">Size ${esc(l.size)} · Qty ${l.qty}</div><b>${money(l.p.price * l.qty)}</b></div></div>`).join('')}
  <div class="coupon"><input id="couponIn" placeholder="Coupon code" value="${esc(S.coupon)}" aria-label="Coupon code"><button type="button" class="btn sm" id="applyCoupon">Apply</button></div>
  ${err ? `<div class="alert err">${esc(err)}</div>` : S.coupon && t.discount ? `<div class="alert ok">Coupon ${esc(S.coupon)} applied</div>` : ''}
  <div class="sum-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.discount ? `<div class="sum-row"><span>Discount</span><span class="green">− ${money(t.discount)}</span></div>` : ''}
  <div class="sum-row"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : '<span class="green">Free</span>'}</span></div><div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>
  <div id="coErr"></div><button class="btn accent block" id="placeBtn" ${err && !lines.length ? 'disabled' : ''} style="margin-top:14px">Place order · ${money(t.total)}</button><p class="muted" style="font-size:12px;margin-top:10px;text-align:center">By placing your order you agree to our <a class="link-u" href="/policy/terms" data-link>Terms</a>.</p>`;
}
document.addEventListener('click', async (e) => {
  if (e.target.closest('#applyCoupon')) { S.coupon = $('#couponIn').value.trim().toUpperCase(); store.set('bf_coupon', S.coupon); renderSummary(); }
  const pay = e.target.closest('.pay'); if (pay && pay.getAttribute('aria-disabled') !== 'true') $$('.pay').forEach((p) => p.classList.toggle('on', p === pay));
  if (e.target.closest('#placeBtn')) { e.preventDefault(); placeOrder(); }
});
async function placeOrder() {
  const form = $('#coForm'), btn = $('#placeBtn'), errEl = $('#coErr');
  const fail = (m) => { errEl.innerHTML = `<div class="alert err" role="alert">${esc(m)}</div>`; errEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  errEl.innerHTML = '';
  const g = (id) => form.elements[id].value.trim();
  const address = Object.fromEntries(['name', 'phone', 'email', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [k, g(k)]));
  const missing = ['name', 'phone', 'line1', 'city', 'state', 'pincode'].find((k) => !address[k]);
  if (missing) { form.elements[missing].focus(); return fail('Please fill in all required delivery details.'); }
  const payment = form.elements.pay.value;
  btn.disabled = true; btn.textContent = 'Placing order…';
  try {
    const r = await api('/orders', { method: 'POST', body: { items: S.cart, coupon: S.coupon, address, payment, notes: $('#notes').value } });
    store.set('bf_addr', address);
    if (r.rzp) return payOnline(r, address);
    finishOrder(r.order);
  } catch (e) { btn.disabled = false; btn.textContent = 'Place order'; fail(e.message); renderSummary(); S.products = null; }
}
function payOnline(r, address) {
  const start = () => new window.Razorpay({
    key: r.rzp.key, amount: r.rzp.amount, currency: 'INR', order_id: r.rzp.orderId, name: 'Baggy Fit', description: 'Order ' + r.order.id, image: '/img/icon.png',
    prefill: { name: address.name, email: address.email, contact: address.phone }, theme: { color: '#f5a623' },
    handler: async (resp) => { try { const v = await api('/payments/verify', { method: 'POST', body: { ...resp, orderId: r.order.id } }); finishOrder(v.order); } catch (e) { toast(e.message); } },
    modal: { ondismiss: () => { const b = $('#placeBtn'); if (b) { b.disabled = false; b.textContent = 'Place order'; } toast('Payment cancelled — you can try again'); } },
  }).open();
  if (window.Razorpay) return start();
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = start; s.onerror = () => toast('Could not load payment window'); document.head.append(s);
}
function finishOrder(order) {
  S.cart = []; S.coupon = ''; store.del('bf_coupon'); saveCart(); S.products = null;
  sessionStorage.setItem('bf_last', JSON.stringify(order)); go('/order/' + order.id);
}
pages.order = async (_q, id) => {
  let o; try { o = JSON.parse(sessionStorage.getItem('bf_last')); } catch {}
  if (!o || o.id !== id) return `<div class="center"><h2>Order ${esc(id)}</h2><p class="muted" style="margin:10px 0 20px">Use order tracking to view this order.</p><a class="btn" href="/track" data-link>Track order</a></div>`;
  const a = o.address, wa = `https://wa.me/${S.cfg.whatsapp}?text=${encodeURIComponent('Hi Baggy Fit, my order ID is ' + o.id)}`;
  return `<div class="center"><div class="tick">✓</div><h1 style="font-size:52px">Order confirmed!</h1><p class="muted" style="margin:10px 0 24px">Thank you, ${esc(a.name)}. Your order <b style="color:#000">${esc(o.id)}</b> is placed.${a.email ? ' We have noted your email for updates.' : ''}</p>
  <div class="box" style="text-align:left">${o.items.map((l) => `<div class="line"><img src="${esc(l.image)}" alt=""><div><h4>${esc(l.name)}</h4><div class="meta">Size ${esc(l.size)} · Qty ${l.qty}</div><b>${money(l.price * l.qty)}</b></div></div>`).join('')}
  <div class="sum-row total"><span>Total ${o.payment.method === 'cod' ? '(pay on delivery)' : '(paid)'}</span><span>${money(o.total)}</span></div><p class="muted" style="font-size:14px;margin-top:14px"><b style="color:#000">Delivering to:</b> ${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}, ${esc(a.city)}, ${esc(a.state)} — ${esc(a.pincode)}</p></div>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a class="btn" href="/track?id=${esc(o.id)}&phone=${esc(a.phone)}" data-link>Track order</a><a class="btn ghost" href="${esc(wa)}" target="_blank" rel="noopener" style="color:#000">Message us on WhatsApp</a></div></div>`;
};

// ----- tracking & account -----
const STEPS = { confirmed: 'Order confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', awaiting_payment: 'Awaiting payment' };
const orderCard = (o) => `<div class="order"><div class="order-top"><div><b>Order ${esc(o.id)}</b><div class="muted" style="font-size:13px">${new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div></div><div><span class="status ${esc(o.status)}">${esc(STEPS[o.status] || o.status)}</span></div></div>
  ${o.items.map((l) => `<div class="line"><img src="${esc(l.image)}" alt=""><div><h4>${esc(l.name)}</h4><div class="meta">Size ${esc(l.size)} · Qty ${l.qty}</div><b>${money(l.price * l.qty)}</b></div></div>`).join('')}
  <div class="sum-row total"><span>Total · ${o.payment.method === 'cod' ? 'COD' : 'Online'} (${esc(o.payment.status)})</span><span>${money(o.total)}</span></div>
  ${o.tracking && o.tracking.id ? `<p style="margin-top:10px;font-size:14px"><b>${esc(o.tracking.courier || 'Courier')}</b> tracking ID: <code>${esc(o.tracking.id)}</code></p>` : ''}
  <ul class="tl">${[...o.timeline].reverse().map((t) => `<li><b>${esc(STEPS[t.status] || t.status)}</b>${t.note ? ` — ${esc(t.note)}` : ''}<small>${new Date(t.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></li>`).join('')}</ul></div>`;
pages.track = async (q) => `<div class="auth"><h1 style="font-size:56px;margin-bottom:6px">Track order</h1><p class="muted" style="margin-bottom:20px">Enter your order ID and the mobile number used at checkout.</p><form class="stack" id="trackForm"><div class="field"><label for="tid">Order ID</label><input id="tid" required placeholder="BF1001" value="${esc(q.get('id') || '')}"></div><div class="field"><label for="tph">Mobile number</label><input id="tph" required inputmode="tel" value="${esc(q.get('phone') || '')}"></div><button class="btn">Track</button></form><div id="trackOut" style="margin-top:24px"></div></div>`;
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'trackForm') {
    e.preventDefault(); const out = $('#trackOut');
    try { out.innerHTML = orderCard(await api(`/orders/track?id=${encodeURIComponent($('#tid').value)}&phone=${encodeURIComponent($('#tph').value)}`)); } catch (er) { out.innerHTML = `<div class="alert err">${esc(er.message)}</div>`; }
  }
});
function setAuth(r) { S.token = r.token; S.user = r.user; store.set('bf_token', r.token); store.set('bf_user', r.user); }
function logout(silent) { S.token = null; S.user = null; store.del('bf_token'); store.del('bf_user'); if (!silent) { toast('Signed out'); route(); } }
pages.account = async (q) => {
  if (S.user) {
    let orders = []; try { orders = await api('/my/orders'); } catch {}
    return `<div class="wrap"><div class="page-title" style="display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:12px"><div><h1>Hi, ${esc(S.user.name.split(' ')[0])}</h1><p class="muted">${esc(S.user.email)}</p></div><div style="display:flex;gap:10px">${S.user.role === 'admin' ? '<a class="btn sm accent" href="/admin" data-link>Admin panel</a>' : ''}<button class="btn sm ghost" id="logoutBtn" style="color:#000">Sign out</button></div></div><h2 style="font-size:32px;margin:24px 0 14px">Your orders</h2>${orders.length ? orders.map(orderCard).join('') : '<div class="empty">No orders yet.</div>'}</div>`;
  }
  return `<div class="auth"><div class="tabs" role="tablist"><button class="on" data-tab="in" role="tab">Sign in</button><button data-tab="up" role="tab">Create account</button></div>
  <form class="stack" id="authForm" data-mode="in" data-next="${esc(q.get('next') || '')}"><div class="field up" hidden><label for="an">Full name</label><input id="an" autocomplete="name"></div><div class="field"><label for="ae">Email</label><input id="ae" type="email" required autocomplete="email"></div><div class="field up" hidden><label for="ap">Mobile (optional)</label><input id="ap" inputmode="tel" autocomplete="tel"></div><div class="field"><label for="aw">Password</label><input id="aw" type="password" required minlength="8" autocomplete="current-password"></div><div id="authErr"></div><button class="btn" id="authBtn">Sign in</button></form></div>`;
};
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { const up = tab.dataset.tab === 'up'; $$('.tabs button').forEach((b) => b.classList.toggle('on', b === tab)); $$('.up').forEach((x) => (x.hidden = !up)); $('#authForm').dataset.mode = up ? 'up' : 'in'; $('#authBtn').textContent = up ? 'Create account' : 'Sign in'; }
  if (e.target.id === 'logoutBtn') logout();
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'authForm') return; e.preventDefault();
  const f = e.target, up = f.dataset.mode === 'up';
  try {
    const r = await api(up ? '/auth/register' : '/auth/login', { method: 'POST', body: { name: $('#an').value, email: $('#ae').value, phone: $('#ap').value, password: $('#aw').value } });
    setAuth(r); toast('Welcome, ' + r.user.name.split(' ')[0]); go(f.dataset.next || '/account');
  } catch (er) { $('#authErr').innerHTML = `<div class="alert err" role="alert">${esc(er.message)}</div>`; }
});

// ----- static pages -----
pages.about = async () => `<div class="wrap"><div class="page-title"><div class="eyebrow">Our story</div><h1>Made loose.<br>Worn loud.</h1></div><div class="store" style="padding:30px 0 70px;color:inherit"><div class="prose" style="padding:0"><p>Baggy Fit started in a small shop with a simple idea: clothes should fit your life, not the other way round. We stock heavyweight oversized tees, polos in every colour, sweatshirts and denim — picked for fabric, fit and finish.</p><p>Every piece is checked by hand before it ships. If it doesn't feel right to us, it doesn't reach you.</p><p><b>Own your look.</b> That's the whole point.</p><p style="margin-top:20px"><a class="btn" href="/shop" data-link>Shop the collection</a></p></div><div class="store-imgs"><img class="a" src="/img/storefront.jpg" alt="Baggy Fit storefront"><img class="b" src="/img/store-wide.jpg" alt="Store interior"><img class="b" src="/img/shelf-tall.jpg" alt="Shelves of folded tees"></div></div></div>`;
pages.contact = async () => `<div class="auth" style="max-width:640px"><h1 style="font-size:56px;margin-bottom:6px">Contact us</h1><p class="muted" style="margin-bottom:20px">Questions about sizing, orders or colours? We reply fast.</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px"><a class="btn accent sm" target="_blank" rel="noopener" href="https://wa.me/${esc(S.cfg.whatsapp)}">WhatsApp us</a><a class="btn ghost sm" style="color:#000" href="mailto:${esc(S.cfg.email)}">${esc(S.cfg.email)}</a></div><form class="stack" id="contactForm"><div class="field"><label for="cn">Name</label><input id="cn" required></div><div class="field"><label for="ce">Email</label><input id="ce" type="email" required></div><div class="field"><label for="cm">Message</label><textarea id="cm" rows="5" required></textarea></div><div id="cOut"></div><button class="btn">Send message</button></form></div>`;
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'contactForm') { e.preventDefault(); try { await api('/contact', { method: 'POST', body: { name: $('#cn').value, email: $('#ce').value, message: $('#cm').value } }); $('#cOut').innerHTML = '<div class="alert ok">Thanks! We\'ll get back to you soon.</div>'; e.target.reset(); } catch (er) { $('#cOut').innerHTML = `<div class="alert err">${esc(er.message)}</div>`; } }
  if (e.target.id === 'newsForm') { e.preventDefault(); try { await api('/subscribe', { method: 'POST', body: { email: e.target.querySelector('input').value } }); $('#newsMsg').textContent = 'You\'re in! Watch your inbox.'; e.target.reset(); } catch (er) { $('#newsMsg').textContent = er.message; } }
});
const POLICIES = {
  shipping: ['Shipping', `<p>We ship across India. Orders are packed within 24–48 hours and usually arrive in 3–7 business days depending on your location.</p><ul><li><b>Free shipping</b> on orders above ${'₹1,499'}.</li><li>A flat ₹79 fee applies to smaller orders.</li><li>You'll get a courier name and tracking ID as soon as your order ships — view it under <a class="link-u" href="/track" data-link>Track order</a>.</li></ul>`],
  returns: ['Exchanges & returns', `<p>Not the right fit? We'll swap it.</p><ul><li>Exchanges accepted within <b>7 days</b> of delivery.</li><li>Items must be unworn, unwashed and have original tags.</li><li>Message us on WhatsApp with your order ID and photos to start an exchange.</li><li>Damaged or wrong item? We'll replace it at no cost.</li></ul>`],
  'size-guide': ['Size guide', `<p>Our tees and sweatshirts are cut oversized. Take your usual size for the baggy look, or size down for a regular fit.</p>${sizeTable()}`],
  privacy: ['Privacy policy', '<p>We collect only what we need to deliver your order: your name, contact details and address. We never sell your data. Payments are processed by our payment partner — we never see or store your card details. Contact us any time to have your data removed.</p>'],
  terms: ['Terms of service', '<p>By placing an order you agree that the details you provide are accurate. Prices include applicable taxes. We may cancel orders affected by pricing errors or stock issues and will refund any payment made. Exchanges are subject to our exchange policy.</p>'],
};
pages.policy = async (_q, key) => { const p = POLICIES[key]; return p ? `<div class="wrap"><div class="page-title"><h1>${p[0]}</h1></div><div class="prose">${p[1]}</div></div>` : notFound(); };
const notFound = () => `<div class="center"><h1 style="font-size:90px">404</h1><p class="muted" style="margin:6px 0 20px">That page wandered off.</p><a class="btn" href="/" data-link>Back home</a></div>`;

// ---------- router ----------
const routes = [
  [/^\/$/, 'home'], [/^\/shop$/, 'shop'], [/^\/product\/([\w-]+)$/, 'product'], [/^\/checkout$/, 'checkout'], [/^\/order\/(\w+)$/, 'order'],
  [/^\/track$/, 'track'], [/^\/account$/, 'account'], [/^\/wishlist$/, 'wishlist'], [/^\/about$/, 'about'], [/^\/contact$/, 'contact'], [/^\/policy\/([\w-]+)$/, 'policy'],
];
const TITLES = { shop: 'Shop', checkout: 'Checkout', track: 'Track order', account: 'Account', wishlist: 'Wishlist', about: 'Our story', contact: 'Contact' };
async function route() {
  closeAll(); view.dataset.pid = ''; pdp = { size: null, qty: 1 };
  const path = location.pathname.replace(/\/+$/, '') || '/', q = new URLSearchParams(location.search);
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === path + location.search || (a.getAttribute('href') === path && !location.search)));
  $('#searchbar').hidden = true;
  if (path === '/admin' || path === '/pos') { document.title = (path === '/pos' ? 'Billing' : 'Admin') + ' — Baggy Fit'; return loadAdmin(path === '/pos' ? 'billing' : undefined); }
  for (const [re, name] of routes) {
    const m = path.match(re); if (!m) continue;
    document.title = (TITLES[name] ? TITLES[name] + ' — ' : '') + 'Baggy Fit' + (name === 'home' ? ' — Own Your Look | Oversized Streetwear' : '');
    view.innerHTML = '<div class="wrap" style="padding:60px 20px"><div class="skeleton" style="height:340px"></div></div>';
    try { view.innerHTML = await pages[name](q, m[1]); } catch (e) { view.innerHTML = `<div class="center"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></div>`; }
    if (name === 'checkout') renderSummary();
    window.scrollTo(0, 0); view.focus({ preventScroll: true }); return;
  }
  view.innerHTML = notFound();
}
function go(url) { history.pushState({}, '', url); route(); }
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);
$('#searchBtn').onclick = () => { const b = $('#searchbar'); b.hidden = !b.hidden; if (!b.hidden) $('#searchInput').focus(); };
$('#searchbar').onsubmit = (e) => { e.preventDefault(); const v = $('#searchInput').value.trim(); if (v) go('/shop?q=' + encodeURIComponent(v)); };
window.BF.go = go; window.BF.logout = logout;
function loadAdmin(tab) {
  const run = () => window.BFAdmin(view, tab);
  if (window.BFAdmin) return run();
  const s = document.createElement('script'); s.src = '/js/admin.js'; s.onload = run; document.head.append(s);
}

// ---------- boot ----------
(async () => {
  $('#yr').textContent = new Date().getFullYear();
  try { S.cfg = await api('/config'); } catch { S.cfg = { freeShipThreshold: 1499, whatsapp: '', email: '', address: '', onlinePayments: false }; }
  $('#announce').textContent = `Free shipping on orders above ${money(S.cfg.freeShipThreshold)} · Cash on delivery available · Code BAGGY10 for 10% off`;
  $('#footAddr').textContent = S.cfg.address; $('#footMail').textContent = S.cfg.email; $('#footMail').href = 'mailto:' + S.cfg.email;
  $('#footWa').href = 'https://wa.me/' + S.cfg.whatsapp;
  const wa = document.createElement('a'); wa.className = 'wa'; wa.href = 'https://wa.me/' + S.cfg.whatsapp; wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'Chat on WhatsApp');
  wa.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.4A8.5 8.5 0 1 1 21 12Z"/><path d="M9 9.5c0 3 2.500 5.500 5.500 5.500l1-1.500-2-1-1 .8c-.8-.4-1.600-1.200-2-2l.8-1-1-2L9 9.500Z"/></svg>';
  document.body.append(wa);
  renderCartCount(); route();
})();
})();
