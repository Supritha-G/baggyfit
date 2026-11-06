(() => {
'use strict';
const { $, $$, esc, money, api, toast, S } = window.BF;
let root, tab = 'billing';
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const CATS = ['tees', 'polos', 'sweatshirts', 'jackets', 'jeans', 'accessories'];
const dt = (t) => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const H = (t) => `<h1 style="font-size:44px;margin-bottom:16px">${t}</h1>`;

window.BFAdmin = (el, startTab) => {
  root = el; if (startTab) tab = startTab;
  if (!S.user || S.user.role !== 'admin') {
    root.innerHTML = `<div class="auth"><h1 style="font-size:52px;margin-bottom:16px">Admin login</h1><form class="stack" id="admForm"><div class="field"><label for="ae">Email</label><input id="ae" type="email" required></div><div class="field"><label for="aw">Password</label><input id="aw" type="password" required></div><div id="authErr"></div><button class="btn">Sign in</button></form></div>`;
    $('#admForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/auth/login', { method: 'POST', body: { email: $('#ae').value, password: $('#aw').value } });
        if (r.user.role !== 'admin') throw new Error('This account is not an admin');
        S.token = r.token; S.user = r.user; window.BF.store.set('bf_token', r.token); window.BF.store.set('bf_user', r.user); window.BFAdmin(root);
      } catch (er) { $('#authErr').innerHTML = `<div class="alert err">${esc(er.message)}</div>`; }
    };
    return;
  }
  shell();
};

function shell() {
  const items = [['billing', '🧾 Billing (scan)'], ['inventory', '📦 Stock & barcodes'], ['products', '➕ Products'], ['orders', 'Orders'], ['dashboard', 'Dashboard'], ['coupons', 'Coupons'], ['messages', 'Messages']];
  root.innerHTML = `<div class="wrap"><div class="adm"><nav class="adm-nav" aria-label="Admin">${items.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}<button id="admOut">Sign out</button></nav><section id="admBody"></section></div></div>`;
  root.querySelector('.adm-nav').onclick = (e) => {
    if (e.target.id === 'admOut') return window.BF.logout();
    const t = e.target.closest('[data-t]'); if (!t) return; tab = t.dataset.t; $$('.adm-nav button').forEach((b) => b.classList.toggle('on', b === t)); show();
  };
  show();
}
async function show() {
  const b = $('#admBody'); b.onclick = null; b.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  try { await views[tab](b); } catch (e) { b.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
}
const views = {};
let jsb;
function barcodeLib() {
  if (window.JsBarcode) return Promise.resolve();
  return jsb || (jsb = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load barcode library (check internet)')); document.head.append(s); }));
}

/* ================= BILLING (POS) ================= */
views.billing = async (b) => {
  let bill = [], mode = 'sell', last = null;
  b.innerHTML = `<style>.pos{display:grid;grid-template-columns:1fr 1.15fr;gap:20px;align-items:start}@media(max-width:900px){.pos{grid-template-columns:1fr}}.scanbox{border:3px solid var(--accent);background:#fff;border-radius:14px;padding:16px}.scanbox input{font-size:22px;padding:14px;width:100%;border:2px solid var(--ink);border-radius:10px}.seg{display:flex;gap:8px;margin-bottom:12px}.seg button{flex:1;padding:10px;border:2px solid var(--ink);border-radius:10px;font-weight:700}.seg button.on{background:var(--ink);color:#fff}.res{display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid var(--line);cursor:pointer}.res:hover{background:#faf9f6}.res img{width:40px;height:50px;object-fit:cover;border-radius:6px}.bigtot{font-family:var(--head);font-size:56px;line-height:1}@media print{body *{visibility:hidden}.receipt,.receipt *{visibility:visible}.receipt{position:absolute;left:0;top:0;width:80mm;font:12px monospace;color:#000}.noprint{display:none!important}}</style>
  ${H('Billing')}<div class="pos"><div><div class="seg"><button data-m="sell" class="on">Sell (scan to bill)</button><button data-m="in">Stock in (scan to add)</button></div>
  <div class="scanbox"><label for="scan" style="font-weight:700;display:block;margin-bottom:8px" id="scanLabel">Scan barcode — the scanner types it and presses Enter</label><input id="scan" autocomplete="off" inputmode="numeric" placeholder="Click here, then scan…" autofocus><div id="scanMsg" style="min-height:22px;margin-top:8px;font-weight:600"></div></div>
  <div class="field" style="margin-top:16px"><label for="srch">No barcode? Search by name</label><input id="srch" placeholder="e.g. black tee" autocomplete="off"></div><div id="results"></div></div>
  <div class="box" style="margin:0"><h3>Current bill</h3><div id="billLines"></div><div id="billSum"></div></div></div>`;
  const scan = $('#scan'), msg = (t, ok = true) => { const m = $('#scanMsg'); m.textContent = t; m.style.color = ok ? 'var(--ok)' : 'var(--red)'; };
  const focusScan = () => scan.focus();
  const beep = (f) => { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.frequency.value = f; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 90); } catch {} };
  const key = (l) => l.id + '|' + l.size;
  function add(item) {
    const ex = bill.find((l) => key(l) === key(item));
    const have = item.stock;
    if ((ex ? ex.qty : 0) + 1 > have) { beep(180); return msg(`${item.name} (${item.size}) — only ${have} in stock`, false); }
    ex ? ex.qty++ : bill.push({ id: item.id, name: item.name, size: item.size, price: item.price, stock: have, qty: 1, image: item.image });
    beep(880); msg(`Added: ${item.name} · ${item.size}`); render();
  }
  function totals() {
    const sub = bill.reduce((s, l) => s + l.price * l.qty, 0), dv = Number($('#dval')?.value) || 0, dtp = $('#dtype')?.value || 'flat';
    const disc = Math.min(sub, dtp === 'percent' ? Math.round((sub * Math.min(dv, 100)) / 100) : Math.round(dv));
    return { sub, disc, total: sub - disc };
  }
  function render() {
    const keep = { dv: $('#dval')?.value || '', dt: $('#dtype')?.value || 'flat', pay: $('#pay')?.value || 'cash', cn: $('#cname')?.value || '', cp: $('#cphone')?.value || '' };
    $('#billLines').innerHTML = bill.length ? bill.map((l, i) => `<div class="line" style="grid-template-columns:50px 1fr auto"><img src="${esc(l.image)}" alt="" style="width:50px;height:62px"><div><h4>${esc(l.name)}</h4><div class="meta" style="margin:0">Size ${esc(l.size)} · ${money(l.price)} · ${l.stock} in stock</div><div class="qty" style="height:32px;margin-top:6px"><button data-dec="${i}" aria-label="Less">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="More">+</button></div></div><div style="text-align:right"><b>${money(l.price * l.qty)}</b><br><button class="rm" data-rm="${i}">Remove</button></div></div>`).join('') : '<p class="muted" style="padding:24px 0">Scan an item to start the bill.</p>';
    $('#billSum').innerHTML = `<div class="sum-row"><span>Subtotal</span><span id="stot">${money(0)}</span></div>
    <div class="fgrid" style="margin:10px 0;grid-template-columns:1fr 1fr 1fr"><div class="field"><label>Discount</label><input id="dval" type="number" min="0" value="${esc(keep.dv)}" placeholder="0"></div><div class="field"><label>Type</label><select id="dtype"><option value="flat" ${keep.dt === 'flat' ? 'selected' : ''}>₹ off</option><option value="percent" ${keep.dt === 'percent' ? 'selected' : ''}>% off</option></select></div><div class="field"><label>Payment</label><select id="pay">${['cash', 'upi', 'card'].map((m) => `<option value="${m}" ${keep.pay === m ? 'selected' : ''}>${m.toUpperCase()}</option>`).join('')}</select></div>
    <div class="field" style="grid-column:span 2"><label>Customer name (optional)</label><input id="cname" value="${esc(keep.cn)}"></div><div class="field"><label>Mobile</label><input id="cphone" inputmode="tel" value="${esc(keep.cp)}"></div></div>
    <div class="sum-row total"><span>TOTAL</span><span class="bigtot" id="gtot">${money(0)}</span></div><div id="saleErr"></div><button class="btn accent block" id="done" style="margin-top:12px" ${bill.length ? '' : 'disabled'}>Complete sale & print bill</button>${bill.length ? '<button class="btn ghost block sm" id="clear" style="margin-top:8px;color:#000">Clear bill</button>' : ''}`;
    upd();
  }
  const upd = () => { const t = totals(); $('#stot').textContent = money(t.sub); $('#gtot').textContent = money(t.total); };
  b.onclick = async (e) => {
    const t = e.target;
    const m = t.closest('[data-m]'); if (m) { mode = m.dataset.m; $$('[data-m]').forEach((x) => x.classList.toggle('on', x === m)); $('#scanLabel').textContent = mode === 'sell' ? 'Scan barcode — adds the item to the bill' : 'STOCK IN — each scan adds 1 to stock'; msg(''); return focusScan(); }
    const inc = t.closest('[data-inc]'), dec = t.closest('[data-dec]'), rm = t.closest('[data-rm]');
    if (inc) { const l = bill[inc.dataset.inc]; if (l.qty + 1 > l.stock) { msg('No more stock', false); } else l.qty++; render(); }
    if (dec) { const l = bill[dec.dataset.dec]; l.qty--; if (l.qty < 1) bill.splice(dec.dataset.dec, 1); render(); }
    if (rm) { bill.splice(rm.dataset.rm, 1); render(); }
    if (t.id === 'clear') { bill = []; render(); focusScan(); }
    const r = t.closest('.res'); if (r) { const item = JSON.parse(r.dataset.item); if (mode === 'sell') add(item); else stockIn(item.barcode); $('#srch').value = ''; $('#results').innerHTML = ''; focusScan(); }
    if (t.id === 'done') {
      t.disabled = true; $('#saleErr').innerHTML = '';
      try {
        const tt = totals();
        const sale = await api('/admin/pos/sale', { method: 'POST', body: { items: bill.map((l) => ({ id: l.id, size: l.size, qty: l.qty })), discount: { type: $('#dtype').value, value: $('#dval').value }, payment: $('#pay').value, customer: { name: $('#cname').value, phone: $('#cphone').value } } });
        S.products = null; last = sale; bill = []; render(); receipt(sale); toast('Sale complete — stock updated ✓'); void tt;
      } catch (er) { t.disabled = false; $('#saleErr').innerHTML = `<div class="alert err">${esc(er.message)}</div>`; }
    }
  };
  b.oninput = (e) => { if (e.target.id === 'dval' || e.target.id === 'dtype') upd(); };
  async function stockIn(code) {
    try { const r = await api('/admin/stock-in', { method: 'POST', body: { barcode: code, qty: 1 } }); beep(880); msg(`+1 ${r.name} (${r.size}) → now ${r.stock} in stock`); S.products = null; }
    catch (er) { beep(180); msg(er.message, false); }
  }
  scan.onkeydown = async (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    const code = scan.value.trim(); scan.value = ''; if (!code) return;
    if (mode === 'in') return stockIn(code);
    try { add(await api('/admin/lookup?code=' + encodeURIComponent(code))); } catch (er) { beep(180); msg(er.message, false); }
  };
  let st; $('#srch').oninput = (e) => {
    clearTimeout(st); const q = e.target.value;
    st = setTimeout(async () => {
      const r = q.trim() ? await api('/admin/search?q=' + encodeURIComponent(q)).catch(() => []) : [];
      $('#results').innerHTML = r.map((x) => `<div class="res" data-item='${esc(JSON.stringify(x))}'><img src="${esc(x.image)}" alt=""><div style="flex:1"><b style="font-size:14px">${esc(x.name)}</b><div class="muted" style="font-size:13px">Size ${esc(x.size)} · ${money(x.price)} · ${x.stock} in stock</div></div><span class="btn sm">${mode === 'sell' ? 'Add' : '+1'}</span></div>`).join('');
    }, 250);
  };
  function receipt(o) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box"><div class="receipt" style="font-family:monospace;font-size:13px"><div style="text-align:center"><b style="font-size:18px">BAGGY FIT</b><br>Own your look<br>${esc(dt(o.createdAt))}<br>Bill: <b>${esc(o.id)}</b></div><hr style="margin:8px 0;border:0;border-top:1px dashed #000">${o.items.map((l) => `<div>${esc(l.name)} (${esc(l.size)})<br><span style="display:flex;justify-content:space-between"><span>${l.qty} × ${l.price}</span><span>${l.qty * l.price}</span></span></div>`).join('')}<hr style="margin:8px 0;border:0;border-top:1px dashed #000"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${o.subtotal}</span></div>${o.discount ? `<div style="display:flex;justify-content:space-between"><span>Discount</span><span>-${o.discount}</span></div>` : ''}<div style="display:flex;justify-content:space-between;font-size:16px"><b>TOTAL</b><b>₹${o.total}</b></div><div>Paid by ${esc(o.payment.method.toUpperCase())}</div><div style="text-align:center;margin-top:10px">Thank you! Exchange within 7 days with bill.</div></div>
    <div class="noprint" style="display:flex;gap:10px;margin-top:16px"><button class="btn accent" style="flex:1" id="pr">Print</button><button class="btn ghost" style="color:#000" id="cl">New bill</button></div></div>`;
    document.body.append(m); $('#pr', m).onclick = () => window.print(); $('#cl', m).onclick = () => { m.remove(); focusScan(); };
  }
  render(); focusScan();
  // keep the scanner field ready: clicking empty space returns focus to it
  b.addEventListener('click', (e) => { if (!e.target.closest('input,select,textarea,button')) focusScan(); });
};

/* ================= INVENTORY & BARCODES ================= */
views.inventory = async (b) => {
  const items = await api('/admin/inventory');
  b.innerHTML = `${H('Stock & barcodes')}<p class="muted" style="margin-bottom:14px">Change a quantity and press Save. Print labels and stick them on each item — scanning the label at billing reduces stock automatically.</p>
  <div class="scroll-x"><table class="tbl"><tr><th></th><th>Product</th><th>Size</th><th>Barcode</th><th>Qty</th><th></th></tr>${items.map((p) => p.sizes.map((s, i) => `<tr data-id="${esc(p.id)}" data-size="${esc(s.size)}" data-code="${esc(s.barcode)}" data-name="${esc(p.name)}" data-price="${p.price}">${i ? '<td></td><td></td>' : `<td rowspan="${p.sizes.length}"><img src="${esc(p.image)}" alt=""></td><td rowspan="${p.sizes.length}"><b>${esc(p.name)}</b><br><span class="muted">${money(p.price)}</span></td>`}<td>${esc(s.size)}</td><td><code>${esc(s.barcode)}</code></td><td><input class="sel q" type="number" min="0" value="${s.qty}" style="width:80px"></td><td style="white-space:nowrap"><button class="btn sm sv">Save</button> <button class="btn sm ghost lb" style="color:#000">Label</button></td></tr>`).join('')).join('')}</table></div>
  <button class="btn" id="allLabels" style="margin-top:16px">Print all labels</button>`;
  const labels = async (rows, copiesFromQty) => {
    try { await barcodeLib(); } catch (e) { return toast(e.message); }
    const svgs = rows.map((r) => {
      const n = copiesFromQty ? 1 : 1; const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      window.JsBarcode(svg, r.dataset.code, { format: 'CODE128', height: 46, width: 1.6, fontSize: 13, margin: 2, displayValue: true });
      return `<div class="lb"><b>BAGGY FIT</b><div>${esc(r.dataset.name)}</div><div>Size ${esc(r.dataset.size)} · ₹${esc(r.dataset.price)}</div>${svg.outerHTML}</div>`.repeat(n);
    }).join('');
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print labels');
    w.document.write(`<html><head><title>Labels</title><style>body{margin:8px;font-family:Arial,sans-serif}.lb{display:inline-block;width:50mm;border:1px dashed #999;padding:3mm;margin:2mm;text-align:center;font-size:11px;page-break-inside:avoid}.lb svg{width:100%;height:auto}</style></head><body>${svgs}<script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close();
  };
  b.onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (e.target.closest('.sv')) { try { await api('/admin/stock', { method: 'POST', body: { id: tr.dataset.id, size: tr.dataset.size, qty: $('.q', tr).value } }); S.products = null; toast('Saved'); } catch (er) { toast(er.message); } }
    if (e.target.closest('.lb')) labels([tr]);
    if (e.target.id === 'allLabels') labels($$('tr[data-id]', b));
  };
};

/* ================= PRODUCTS (simple add/edit) ================= */
views.products = async (b) => {
  const ps = (await api('/admin/products')).filter((p) => p.active !== false);
  b.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px"><h1 style="font-size:44px">Products</h1><button class="btn accent" id="newP">+ Add new product</button></div><div class="scroll-x"><table class="tbl"><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Total stock</th><th></th></tr>${ps.map((p) => `<tr><td><img src="${esc(p.images[0])}" alt=""></td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.sizes.reduce((s, z) => s + (p.stock[z] || 0), 0)}</td><td style="white-space:nowrap"><button class="btn sm ghost" style="color:#000" data-edit="${esc(p.id)}">Edit</button> <button class="btn sm ghost" style="color:#a00" data-del="${esc(p.id)}">Delete</button></td></tr>`).join('')}</table></div>`;
  $('#newP').onclick = () => editor(null);
  b.onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) editor(ps.find((p) => p.id === ed.dataset.edit));
    if (del && confirm('Delete this product? Past bills are kept.')) { await api('/admin/products/' + del.dataset.del, { method: 'DELETE' }); S.products = null; toast('Deleted'); show(); }
  };
};
async function editor(p) {
  const lib = await api('/admin/images');
  let imgs = p ? [...p.images] : [];
  const m = document.createElement('div'); m.className = 'modal';
  const v = (k, d = '') => esc(p ? p[k] ?? d : d);
  m.innerHTML = `<form class="box stack" style="gap:14px"><h3>${p ? 'Edit product' : 'Add new product'}</h3>
  <div class="field"><label>1. Product name *</label><input name="name" required placeholder="e.g. Black Oversized Tee" value="${v('name')}"></div>
  <div class="fgrid"><div class="field"><label>2. Category</label><select name="category">${CATS.map((c) => `<option ${p?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Colour</label><input name="color" value="${v('color')}"></div>
  <div class="field"><label>3. Selling price (₹) *</label><input name="price" type="number" min="1" required value="${v('price')}"></div><div class="field"><label>Old price / MRP (₹) <small class="muted">(shows strike-through)</small></label><input name="mrp" type="number" min="1" value="${v('mrp')}"></div></div>
  <div class="field"><label>4. Photo * <small class="muted">(upload from phone/computer, or pick an existing one)</small></label><input type="file" id="up" accept="image/jpeg,image/png,image/webp"><div class="imgpick" id="pick">${[...new Set([...imgs, ...lib])].map((u) => `<img src="${esc(u)}" data-u="${esc(u)}" class="${imgs.includes(u) ? 'on' : ''}" alt="">`).join('')}</div></div>
  <div class="field"><label>5. How many pieces in each size?</label><div class="stockgrid">${SIZES.map((s) => `<div><label>${s}</label><input type="number" min="0" data-stock="${s}" value="${p ? p.stock[s] ?? 0 : 0}"></div>`).join('')}</div></div>
  <details><summary style="cursor:pointer;font-weight:600">More options (description, barcodes, tag)</summary><div class="stack" style="margin-top:12px"><div class="field"><label>Description</label><textarea name="description" rows="3">${v('description')}</textarea></div><div class="field"><label>Details (one per line)</label><textarea name="details" rows="3">${esc((p?.details || []).join('\n'))}</textarea></div><div class="field"><label>Tag (e.g. New, Bestseller)</label><input name="tag" maxlength="20" value="${v('tag')}"></div><div class="field"><label><input type="checkbox" name="featured" ${p?.featured ? 'checked' : ''} style="width:auto"> Show on home page</label></div>
  <div class="field"><label>Barcodes <small class="muted">(auto-created. If the item already has a barcode sticker, type it here to use that instead)</small></label><div class="stockgrid" style="grid-template-columns:repeat(2,1fr)">${SIZES.map((s) => `<div><label>${s}</label><input data-bc="${s}" value="${esc(p?.barcodes?.[s] || '')}" placeholder="auto"></div>`).join('')}</div></div></div></details>
  <div id="eErr"></div><div style="display:flex;gap:10px"><button class="btn accent" style="flex:1">Save product</button><button type="button" class="btn ghost" style="color:#000" id="cancel">Cancel</button></div></form>`;
  document.body.append(m);
  const pick = $('#pick', m);
  pick.onclick = (e) => { const i = e.target.closest('img'); if (!i) return; const u = i.dataset.u; imgs = imgs.includes(u) ? imgs.filter((x) => x !== u) : [...imgs, u]; i.classList.toggle('on', imgs.includes(u)); };
  $('#up', m).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await api('/admin/upload', { method: 'POST', headers: { 'Content-Type': f.type }, body: f }); imgs.unshift(r.url); pick.insertAdjacentHTML('afterbegin', `<img src="${esc(r.url)}" data-u="${esc(r.url)}" class="on" alt="">`); toast('Photo added'); } catch (er) { toast(er.message); }
  };
  $('#cancel', m).onclick = () => m.remove();
  $('form', m).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const stock = {}; $$('[data-stock]', m).forEach((i) => (stock[i.dataset.stock] = i.value));
    const barcodes = {}; $$('[data-bc]', m).forEach((i) => { if (i.value.trim()) barcodes[i.dataset.bc] = i.value.trim(); });
    const body = { name: f.name.value, category: f.category.value, color: f.color.value, price: f.price.value, mrp: f.mrp.value, tag: f.tag.value, featured: f.featured.checked, description: f.description.value, details: f.details.value.split('\n'), sizes: SIZES, stock, barcodes, images: imgs };
    try { await api(p ? '/admin/products/' + p.id : '/admin/products', { method: p ? 'PUT' : 'POST', body }); S.products = null; m.remove(); toast('Saved ✓'); show(); } catch (er) { $('#eErr', m).innerHTML = `<div class="alert err">${esc(er.message)}</div>`; }
  };
}

/* ================= DASHBOARD ================= */
views.dashboard = async (b) => {
  const s = await api('/admin/stats');
  b.innerHTML = `${H('Dashboard')}<div class="stats"><div class="stat"><b>${money(s.revenue)}</b><span>Total sales (online + store)</span></div><div class="stat"><b>${s.orders}</b><span>Bills & orders</span></div><div class="stat"><b>${s.today}</b><span>Last 24 hours</span></div><div class="stat"><b>${s.pending}</b><span>Online orders to ship</span></div><div class="stat"><b>${s.customers}</b><span>Customers</span></div><div class="stat"><b>${s.messages}</b><span>Messages</span></div></div>
  <h2 style="font-size:28px;margin:10px 0">Low stock (2 or fewer)</h2>${s.lowStock.length ? `<div class="scroll-x"><table class="tbl"><tr><th>Product</th><th>Size</th><th>Left</th></tr>${s.lowStock.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.size)}</td><td>${l.left}</td></tr>`).join('')}</table></div>` : '<p class="muted">All stocked up.</p>'}`;
};

/* ================= ORDERS ================= */
views.orders = async (b) => {
  const orders = await api('/admin/orders');
  b.innerHTML = `${H('Orders & bills')}${orders.length ? orders.map((o) => `<div class="order" data-o="${esc(o.id)}"><div class="order-top"><div><b>${esc(o.id)}</b> ${o.source === 'store' ? '<span class="status delivered">In-store</span>' : '<span class="status shipped">Online</span>'} · ${esc(o.address.name)} ${esc(o.address.phone)}<div class="muted" style="font-size:13px">${dt(o.createdAt)} · ${o.payment.method.toUpperCase()} (${esc(o.payment.status)}) · ${money(o.total)}</div></div><span class="status ${esc(o.status)}">${esc(o.status.replace('_', ' '))}</span></div>
  <p style="font-size:14px">${o.items.map((l) => `${esc(l.name)} (${esc(l.size)}) ×${l.qty}`).join('<br>')}</p>
  ${o.source === 'store' ? (o.status === 'cancelled' ? '' : '<button class="btn sm ghost void" style="color:#a00;margin-top:8px">Void bill (return stock)</button>') : `<p class="muted" style="font-size:13px;margin:8px 0">${esc(o.address.line1)}${o.address.line2 ? ', ' + esc(o.address.line2) : ''}, ${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pincode)}${o.notes ? ' · Note: ' + esc(o.notes) : ''}</p>` + (o.status === 'awaiting_payment' ? '<p class="muted">Awaiting online payment.</p>' : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="sel st">${['confirmed', 'packed', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><input class="sel co" placeholder="Courier" value="${esc(o.tracking?.courier || '')}" style="width:130px"><input class="sel tid" placeholder="Tracking ID" value="${esc(o.tracking?.id || '')}" style="width:160px"><button class="btn sm save">Update</button></div>`)}</div>`).join('') : '<div class="empty">No orders yet.</div>'}`;
  b.onclick = async (e) => {
    const card = e.target.closest('[data-o]'); if (!card) return;
    try {
      if (e.target.closest('.void') && confirm('Void this bill and return items to stock?')) { await api('/admin/orders/' + card.dataset.o, { method: 'PATCH', body: { status: 'cancelled', note: 'Bill voided' } }); S.products = null; toast('Bill voided'); show(); }
      if (e.target.closest('.save')) { await api('/admin/orders/' + card.dataset.o, { method: 'PATCH', body: { status: $('.st', card).value, courier: $('.co', card).value, trackingId: $('.tid', card).value } }); S.products = null; toast('Order updated'); show(); }
    } catch (er) { toast(er.message); }
  };
};

views.coupons = async (b) => {
  const cs = await api('/admin/coupons');
  b.innerHTML = `${H('Coupons')}<div class="scroll-x"><table class="tbl"><tr><th>Code</th><th>Type</th><th>Value</th><th>Min order</th><th></th></tr>${cs.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.type)}</td><td>${c.type === 'percent' ? c.value + '%' : c.type === 'flat' ? money(c.value) : '—'}</td><td>${money(c.min)}</td><td><button class="btn sm ghost" style="color:#a00" data-d="${esc(c.code)}">Remove</button></td></tr>`).join('')}</table></div>
  <form class="box fgrid" id="cf" style="margin-top:20px"><div class="field"><label>Code</label><input name="code" required></div><div class="field"><label>Type</label><select name="type"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option><option value="ship">Free shipping</option></select></div><div class="field"><label>Value</label><input name="value" type="number" min="0" value="10"></div><div class="field"><label>Minimum order (₹)</label><input name="min" type="number" min="0" value="0"></div><button class="btn full">Add / update coupon</button></form>`;
  b.onclick = async (e) => { const d = e.target.closest('[data-d]'); if (d) { await api('/admin/coupons/' + d.dataset.d, { method: 'DELETE' }); show(); } };
  $('#cf').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await api('/admin/coupons', { method: 'POST', body: { code: f.code.value, type: f.type.value, value: f.value.value, min: f.min.value } }); show(); } catch (er) { toast(er.message); } };
};

views.messages = async (b) => {
  const ms = await api('/admin/messages');
  b.innerHTML = `${H('Messages')}${ms.length ? ms.map((m) => `<div class="order"><b>${esc(m.name)}</b> · <a class="link-u" href="mailto:${esc(m.email)}">${esc(m.email)}</a><div class="muted" style="font-size:13px;margin-bottom:8px">${dt(m.createdAt)}</div><p>${esc(m.message)}</p></div>`).join('') : '<div class="empty">No messages.</div>'}`;
};
})();
