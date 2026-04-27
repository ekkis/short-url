import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://ekkis.id';
const DB_PATH = process.env.DB_PATH || './urls.db';

app.set('trust proxy', true);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    long_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hit_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_urls_slug ON urls(slug);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_urls_long_url ON urls(long_url);
`);

const insertUrl = db.prepare('INSERT INTO urls (slug, long_url) VALUES (?, ?)');
const findBySlug = db.prepare('SELECT slug, long_url, created_at, hit_count FROM urls WHERE slug = ?');
const findByLongUrl = db.prepare('SELECT slug, long_url, created_at, hit_count FROM urls WHERE long_url = ?');
const incrementHits = db.prepare('UPDATE urls SET hit_count = hit_count + 1 WHERE slug = ?');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase62(buffer) {
  let value = BigInt('0x' + buffer.toString('hex'));
  if (value === 0n) return '0';
  let out = '';
  while (value > 0n) {
    out = BASE62[Number(value % 62n)] + out;
    value /= 62n;
  }
  return out;
}

function generateSlug(size = 6) {
  return toBase62(crypto.randomBytes(size)).slice(0, size + 2);
}

function normalizeInput(raw) {
  const decoded = decodeURIComponent(raw || '').trim();
  if (!decoded) throw new Error('Missing URL');
  const withProtocol = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }
  return parsed.toString();
}

function createUniqueSlug() {
  for (let i = 0; i < 10; i += 1) {
    const slug = generateSlug(5);
    if (!findBySlug.get(slug)) return slug;
  }
  throw new Error('Could not generate unique slug');
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/s/*', (req, res) => {
  try {
    const rawTarget = req.params[0];
    const longUrl = normalizeInput(rawTarget);
    const existing = findByLongUrl.get(longUrl);
    if (existing) {
      return res.json({
        short_url: `${BASE_URL}/u/${existing.slug}`,
        slug: existing.slug,
        long_url: existing.long_url,
        created_at: existing.created_at,
        reused: true
      });
    }

    const slug = createUniqueSlug();
    insertUrl.run(slug, longUrl);

    return res.status(201).json({
      short_url: `${BASE_URL}/u/${slug}`,
      slug,
      long_url: longUrl,
      reused: false
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/u/:slug', (req, res) => {
  const { slug } = req.params;
  const row = findBySlug.get(slug);

  if (!row) {
    return res.status(404).json({ error: 'Short URL not found' });
  }

  incrementHits.run(slug);
  return res.redirect(302, row.long_url);
});

app.get('/u/:slug/info', (req, res) => {
  const row = findBySlug.get(req.params.slug);
  if (!row) {
    return res.status(404).json({ error: 'Short URL not found' });
  }
  return res.json({
    short_url: `${BASE_URL}/u/${row.slug}`,
    long_url: row.long_url,
    created_at: row.created_at,
    hit_count: row.hit_count
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    usage: {
      create: `${BASE_URL}/s/<url-encoded-or-plain-url>`,
      open: `${BASE_URL}/u/<slug>`
    }
  });
});

app.listen(PORT, () => {
  console.log(`URL shortener listening on ${PORT}`);
});
