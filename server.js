/**
 * Gelato Order Proxy — server.js
 *
 * Backend-only server. Deploy to Railway (or Render/Fly.io).
 * Your index.html lives on GitHub Pages and calls this server.
 *
 * Setup:
 *   1. npm install
 *   2. Set environment variables (Railway dashboard or .env locally):
 *        GELATO_API_KEY=your_key_here
 *        ALLOWED_ORIGIN=https://YOUR_GITHUB_USERNAME.github.io
 *        PORT=3001  (Railway sets this automatically)
 *   3. node server.js
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;
const GELATO_API_KEY  = process.env.GELATO_API_KEY;
const ALLOWED_ORIGIN  = process.env.ALLOWED_ORIGIN || '*';

const GELATO_ORDER_URL   = 'https://order.gelatoapis.com/v4/orders';
const GELATO_CATALOG_URL = 'https://product.gelatoapis.com/v3/catalogs';
const GELATO_PRODUCT_URL = 'https://product.gelatoapis.com/v3/products';

if (!GELATO_API_KEY) {
  console.error('❌  GELATO_API_KEY environment variable is not set.');
  process.exit(1);
}

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'gelato-proxy' }));

// ── Catalog: list all catalogs ────────────────────────────────────────────────
// GET /api/catalogs
app.get('/api/catalogs', async (_req, res) => {
  try {
    const r = await fetch(GELATO_CATALOG_URL, {
      headers: { 'X-API-KEY': GELATO_API_KEY },
    });
    const text = await r.text();
    console.log('Gelato /catalogs raw response:', r.status, text.slice(0, 500));
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).json({ error: `Non-JSON from Gelato: ${text.slice(0,200)}` }); }
    if (!r.ok) return res.status(r.status).json({ error: JSON.stringify(data) });
    // Normalise: Gelato may return array or { catalogs: [] }
    const catalogs = Array.isArray(data) ? data : (data.catalogs || data.data || []);
    res.json(catalogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Catalog: get attributes for one catalog ───────────────────────────────────
// GET /api/catalogs/:catalogUid
app.get('/api/catalogs/:catalogUid', async (req, res) => {
  try {
    const r = await fetch(`${GELATO_CATALOG_URL}/${req.params.catalogUid}`, {
      headers: { 'X-API-KEY': GELATO_API_KEY },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: JSON.stringify(data) });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Catalog: search products within a catalog ─────────────────────────────────
// POST /api/catalogs/:catalogUid/products
// Body: { attributes: { PaperFormat: ["A3"], Orientation: ["ver"] }, limit: 20, offset: 0 }
app.post('/api/catalogs/:catalogUid/products', async (req, res) => {
  try {
    const r = await fetch(`${GELATO_CATALOG_URL}/${req.params.catalogUid}/products:search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': GELATO_API_KEY,
      },
      body: JSON.stringify({
        attributes: req.body.attributes || {},
        limit:  req.body.limit  || 20,
        offset: req.body.offset || 0,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: JSON.stringify(data) });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Product: get a single product by UID ─────────────────────────────────────
// GET /api/products/:productUid
app.get('/api/products/:productUid', async (req, res) => {
  try {
    const r = await fetch(`${GELATO_PRODUCT_URL}/${req.params.productUid}`, {
      headers: { 'X-API-KEY': GELATO_API_KEY },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: JSON.stringify(data) });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Orders ────────────────────────────────────────────────────────────────────
// POST /api/order
app.post('/api/order', async (req, res) => {
  const { shippingAddress, items } = req.body;

  if (!shippingAddress || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing shippingAddress or items.' });
  }

  const required = ['firstName','lastName','email','addressLine1','city','postCode','country'];
  for (const field of required) {
    if (!shippingAddress[field]) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const orderId    = `order-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const customerId = `cust-${crypto.createHash('md5').update(shippingAddress.email).digest('hex').slice(0,8)}`;

  const gelatoPayload = {
    orderType:           'order',
    orderReferenceId:    orderId,
    customerReferenceId: customerId,
    currency:            'EUR',
    items: items.map((item, idx) => ({
      itemReferenceId: item.itemRef || `item-${idx}`,
      productUid:      item.productUid,
      files: [{ type: 'default', url: item.fileUrl }],
      quantity:        item.quantity || 1,
    })),
    shipmentMethodUid: 'standard',
    shippingAddress: {
      firstName:    shippingAddress.firstName,
      lastName:     shippingAddress.lastName,
      email:        shippingAddress.email,
      phone:        shippingAddress.phone       || '',
      addressLine1: shippingAddress.addressLine1,
      addressLine2: shippingAddress.addressLine2 || '',
      city:         shippingAddress.city,
      state:        shippingAddress.state        || '',
      postCode:     shippingAddress.postCode,
      country:      shippingAddress.country.toUpperCase(),
    },
  };

  try {
    const gelatoRes = await fetch(GELATO_ORDER_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY':    GELATO_API_KEY,
      },
      body: JSON.stringify(gelatoPayload),
    });

    const data = await gelatoRes.json();

    if (!gelatoRes.ok) {
      console.error('Gelato error:', data);
      const message = data?.message || data?.error || JSON.stringify(data);
      return res.status(gelatoRes.status).json({ error: `Gelato: ${message}` });
    }

    console.log(`✅  Order placed: ${data.id || orderId}`);
    return res.json({ orderId: data.id || orderId, status: data.status });

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Failed to reach Gelato API. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀  Gelato proxy running on port ${PORT}`);
  console.log(`    Accepting requests from: ${ALLOWED_ORIGIN}\n`);
});
