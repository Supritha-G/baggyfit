# Baggy Fit — e-commerce site

Full-stack store: storefront, cart, checkout (COD + optional Razorpay), order tracking, customer accounts, wishlist, coupons, and an admin panel.

## Run
```
npm install
npm start            # http://localhost:3000
```
On first start an admin account is created and its password is printed in the terminal
(`admin@baggyfit.in`). To choose it yourself: `ADMIN_PASSWORD='your-password' npm start`
(delete the `data/` folder first if the store was already started once).

## Settings (environment variables)
| Variable | Purpose |
|---|---|
| `WHATSAPP` | Your WhatsApp number with country code, no `+` (e.g. `919876543210`). **Set this** — default is a placeholder. |
| `STORE_EMAIL` | Contact email shown in the footer |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Enables UPI/Card/Netbanking at checkout. Without them, only Cash on Delivery is offered. |
| `ADMIN_PASSWORD` | Admin password on first run |
| `PORT` | Default 3000 |

Shipping fee, free-shipping threshold and store address are in `server/index.js` (`CONFIG`).

## Admin — `/admin`
Dashboard · orders (status, courier + tracking ID) · products (add/edit/delete, stock per size, upload images) · coupons · customer messages.

## Where things are
- `public/` storefront (`js/app.js`, `js/admin.js`, `css/style.css`, `img/`)
- `server/index.js` API · `server/seed.js` starting catalogue (prices are editable in /admin)
- `data/db.json` all store data (created on first run) — back this up.
