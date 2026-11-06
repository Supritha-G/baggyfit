// Initial catalogue. Prices are in INR (GST inclusive). Edit freely or manage from /admin.
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const stock = (n) => Object.fromEntries(SIZES.map((s, i) => [s, Math.max(0, n - (i === 4 ? 4 : i === 0 ? 3 : 0))]));

const tee = (id, name, price, mrp, img, color, tag, desc) => ({
  id, slug: id, name, category: 'tees', price, mrp, color, tag,
  images: [`/img/${img}.jpg`], sizes: SIZES, stock: stock(14),
  description: desc,
  details: ['Oversized boxy fit', '240 GSM heavyweight combed cotton', 'Small chest print on front, large graphic on back', 'Ribbed crew neck, drop shoulder', 'Machine wash cold, inside out'],
  featured: true, createdAt: Date.now(),
});

const products = [
  tee('scarlet-grid-tee', 'Scarlet Grid Racer Tee', 999, 1499, 'tee-red', 'Red', 'Bestseller', 'A statement back print on a rich scarlet oversized tee. Clean front, loud back — made to be noticed.'),
  tee('cobalt-turbo-tee', 'Cobalt Classic Turbo Tee', 999, 1499, 'tee-cobalt', 'Cobalt Blue', 'New', 'Electric cobalt with a vintage sports-car back graphic. Built for easy street styling.'),
  tee('chevron-racer-tee', 'Chevron Racer Tee', 1049, 1599, 'tee-chevron', 'Black / Red', 'Limited', 'Bold red chevron panel over a black base with a heritage race-car graphic.'),
  tee('heritage-stripe-tee', 'Heritage Stripe Tee', 999, 1499, 'tee-heritage', 'Cream', '', 'Soft cream tee with racing-stripe artwork running down the back.'),
  tee('sky-stripe-tee', 'Sky Stripe Racer Tee', 999, 1499, 'tee-sky', 'Powder Blue', 'New', 'Powder blue base, red centre-stripe back print. Light, fresh and loud.'),
  tee('silver-arrow-tee', 'Silver Arrow Sand Tee', 1049, 1599, 'tee-sand', 'Sand', '', 'Muted sand tee with a detailed top-down race-car print. Quiet front, standout back.'),
  tee('endurance-23-tee', 'Endurance 23 Cream Tee', 999, 1499, 'tee-cream', 'Off White', '', 'Off-white tee with a big number-23 back graphic and a low-slung endurance racer.'),
  tee('papaya-racer-tee', 'Papaya Racer Tee', 1049, 1599, 'tee-papaya', 'Papaya Orange', 'Bestseller', 'Loud papaya orange, tonal back graphics and a sharp racer illustration.'),
  tee('precision-green-tee', 'Precision Green Tee', 1049, 1599, 'tee-green', 'Racing Green', 'New', 'Deep racing green with a technical blueprint-style racer print on the back.'),
  tee('midnight-gt-tee', 'Midnight GT Tee', 999, 1499, 'tee-black', 'Black', 'Bestseller', 'The essential black tee, with a GT-racer back graphic and tricolour stripe detail.'),
  {
    id: 'camel-twin-stripe-polo', slug: 'camel-twin-stripe-polo', name: 'Camel Twin-Stripe Polo', category: 'polos', price: 1299, mrp: 1999,
    color: 'Camel', tag: 'New', images: ['/img/polo-duo.jpg', '/img/polo-set.jpg'], sizes: SIZES, stock: stock(10),
    description: 'A relaxed-fit knit polo with contrast twin stripes and a tipped collar. Available in 7 colourways — ask us on WhatsApp for your pick.',
    details: ['Soft pique cotton knit', 'Contrast tipped collar & cuffs', 'Two-button placket', 'Regular-relaxed fit', 'Machine wash cold'],
    featured: true, createdAt: Date.now(),
  },
  {
    id: 'colour-block-polo', slug: 'colour-block-polo', name: 'Colour-Block Knit Polo', category: 'polos', price: 1349, mrp: 1999,
    color: 'Assorted', tag: '', images: ['/img/polo-set.jpg', '/img/polo-duo.jpg'], sizes: SIZES, stock: stock(8),
    description: 'Seven shades, one great fit. Stripe, tipped and colour-block variants of our everyday polo.',
    details: ['Soft pique cotton knit', 'Embroidered chest detail', 'Ribbed collar and sleeve ends', 'Regular fit', 'Machine wash cold'],
    featured: false, createdAt: Date.now(),
  },
  {
    id: 'navy-crest-sweatshirt', slug: 'navy-crest-sweatshirt', name: 'Navy Crest Sweatshirt', category: 'sweatshirts', price: 1799, mrp: 2599,
    color: 'Navy', tag: 'Bestseller', images: ['/img/sweat-navy.jpg'], sizes: SIZES, stock: stock(9),
    description: 'Heavyweight navy crewneck with a rich embroidered crest. A wardrobe staple that layers with everything.',
    details: ['320 GSM brushed fleece', 'Embroidered crest', 'Ribbed cuffs and hem', 'Relaxed fit', 'Machine wash cold'],
    featured: true, createdAt: Date.now(),
  },
  {
    id: 'burgundy-emblem-sweatshirt', slug: 'burgundy-emblem-sweatshirt', name: 'Burgundy Emblem Sweatshirt', category: 'sweatshirts', price: 1799, mrp: 2599,
    color: 'Burgundy', tag: '', images: ['/img/sweat-burgundy.jpg'], sizes: SIZES, stock: stock(9),
    description: 'Deep burgundy crewneck with gold-thread emblem embroidery and striped detailing.',
    details: ['320 GSM brushed fleece', 'Gold-thread embroidery', 'Ribbed cuffs and hem', 'Relaxed fit', 'Machine wash cold'],
    featured: true, createdAt: Date.now(),
  },
  {
    id: 'olive-rider-sweatshirt', slug: 'olive-rider-sweatshirt', name: 'Olive Rider Sweatshirt', category: 'sweatshirts', price: 1699, mrp: 2499,
    color: 'Olive', tag: 'New', images: ['/img/sweat-olive.jpg'], sizes: SIZES, stock: stock(8),
    description: 'Olive green crewneck with a vintage rider graphic. Also available in off-white.',
    details: ['300 GSM brushed fleece', 'Screen-printed graphic', 'Ribbed cuffs and hem', 'Relaxed fit', 'Machine wash cold'],
    featured: false, createdAt: Date.now(),
  },
  {
    id: 'noir-shield-sweatshirt', slug: 'noir-shield-sweatshirt', name: 'Noir Shield Sweatshirt', category: 'sweatshirts', price: 1799, mrp: 2599,
    color: 'Black', tag: '', images: ['/img/sweat-noir.jpg'], sizes: SIZES, stock: stock(8),
    description: 'Black crewneck with a red-and-gold shield embroidery. Sharp, simple, and easy to style.',
    details: ['320 GSM brushed fleece', 'Embroidered shield', 'Ribbed cuffs and hem', 'Relaxed fit', 'Machine wash cold'],
    featured: false, createdAt: Date.now(),
  },
  {
    id: 'washed-denim-trucker-jacket', slug: 'washed-denim-trucker-jacket', name: 'Washed Denim Trucker Jacket', category: 'jackets', price: 2499, mrp: 3499,
    color: 'Washed Blue / Black', tag: 'New', images: ['/img/jackets.jpg'], sizes: SIZES, stock: stock(7),
    description: 'Classic trucker jacket in washed denim, available in black, grey and light blue washes. Roomy enough for a hoodie underneath.',
    details: ['Mid-weight rigid denim', 'Button-front with chest pockets', 'Relaxed fit', 'Colour: ask for black, grey or light wash', 'Machine wash cold'],
    featured: true, createdAt: Date.now(),
  },
];

const coupons = [
  { code: 'BAGGY10', type: 'percent', value: 10, min: 999, active: true, note: '10% off orders above ₹999' },
  { code: 'WELCOME200', type: 'flat', value: 200, min: 1999, active: true, note: '₹200 off orders above ₹1,999' },
  { code: 'FREESHIP', type: 'ship', value: 0, min: 0, active: true, note: 'Free shipping' },
];

module.exports = { products, coupons, SIZES };
