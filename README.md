# Gelato Print Store

A print-on-demand storefront integrated with the [Gelato API](https://dashboard.gelato.com/docs/).

**Deployment split:**
- `index.html` → GitHub Pages (free static hosting)
- `server.js` → Railway (free Node.js hosting, keeps your API key safe)

---

## Repo structure

```
gelato-store/
├── index.html   ← storefront (GitHub Pages)
├── server.js    ← API proxy (Railway)
├── package.json
└── .env         ← local only, never commit this
```

---

## Step 1 — Deploy the backend to Railway

1. Push this whole folder to a GitHub repo.

2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick your repo.

3. In Railway's **Variables** tab, add:

   | Variable | Value |
   |----------|-------|
   | `GELATO_API_KEY` | your Gelato API key |
   | `ALLOWED_ORIGIN` | `https://YOUR_GITHUB_USERNAME.github.io` |

4. Railway will auto-detect Node and run `node server.js`. Once deployed, copy your Railway URL — it looks like `https://gelato-store-production.up.railway.app`.

---

## Step 2 — Configure the frontend

Open `index.html` and find this line near the top of the `<script>` block:

```js
const API_BASE = 'https://YOUR_RAILWAY_URL_HERE';
```

Replace it with your actual Railway URL:

```js
const API_BASE = 'https://gelato-store-production.up.railway.app';
```

---

## Step 3 — Deploy the frontend to GitHub Pages

1. Go to your GitHub repo → **Settings** → **Pages**.
2. Set **Source** to `Deploy from a branch` → `main` → `/ (root)`.
3. Save. Your store will be live at `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/`.

---

## Local development

```bash
npm install
```

Create `.env`:
```
GELATO_API_KEY=your_key_here
ALLOWED_ORIGIN=*
PORT=3001
```

In `index.html`, temporarily set:
```js
const API_BASE = 'http://localhost:3001';
```

Then:
```bash
node server.js
```

Open `index.html` directly in your browser or serve it with `npx serve .`.

---

## Customising your products

Edit the `PRODUCTS` array in `index.html`:

```js
{
  id: 'my-poster',
  name: 'My Art Poster',
  desc: 'Short description.',
  emoji: '🖼️',
  variants: [
    { label: 'A3', productUid: 'poster_paper-matte-170gsm_size-a3_orientation-portrait', price: 15.00 },
  ],
  fileUrl: 'https://your-cdn.com/your-artwork.png', // must be publicly accessible
}
```

- **productUid** — from your Gelato dashboard → Products → copy the UID
- **fileUrl** — a public URL to your artwork (JPEG, PNG, SVG, or PDF)
- **price** — what you charge; Gelato bills you the production cost separately

---

## Production checklist

- [ ] Replace `YOUR_RAILWAY_URL_HERE` in `index.html` with your real Railway URL
- [ ] Replace demo `fileUrl` values with your actual artwork URLs
- [ ] Update `productUid` values from your Gelato dashboard
- [ ] Set `ALLOWED_ORIGIN` in Railway to your exact GitHub Pages URL
- [ ] Add a payment step (Stripe) before the order is submitted
- [ ] Test with a Gelato sandbox order (auto-cancelled, not shipped)
