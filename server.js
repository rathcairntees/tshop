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
const ALLOWED_ORIGIN  = process.env.ALLOWED_ORIGIN || '*'; // e.g. https://yourname.github.io

const GELATO_ORDER_URL = 'https://order.gelatoapis.com/v4/orders';

if (!GELATO_API_KEY) {
  console.error('❌  GELATO_API_KEY environment variable is not set.');
  process.exit(1);
}

// Only allow requests from your GitHub Pages domain
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'OPTIONS'],
}));

app.use(express.json());

// Health check — Railway uses this to confirm the app is up
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'gelato-proxy' }));

/**
 * POST /api/order
 *
 * Body: { shippingAddress: {...}, items: [{productUid, fileUrl, quantity, itemRef}] }
 */
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
    currency:            'EUR',        // ← change to match your store
    items: items.map((item, idx) => ({
      itemReferenceId: item.itemRef || `item-${idx}`,
      productUid:      item.productUid,
      files: [{ type: 'default', url: item.fileUrl }],
      quantity:        item.quantity || 1,
    })),
    shipmentMethodUid: 'standard',     // standard | express | economy
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
