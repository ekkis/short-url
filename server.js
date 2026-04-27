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
function isUrl(str) {
  return /^https?:\/\//i.test(str) || /^[^\s\/]+\.[^\s\/]+/i.test(str);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/u/:param', (req, res) => {
  const { param } = req.params;

  // If it looks like a URL, create a short URL
  if (isUrl(param)) {
    try {
      const longUrl = normalizeInput(param);
      const existing = findByLongUrl.get(longUrl);
      if (existing) {
        return res.send(`${BASE_URL}/u/${existing.slug}`);
      }

      const slug = createUniqueSlug();
      insertUrl.run(slug, longUrl);

      return res.send(`${BASE_URL}/u/${slug}`);
    } catch (error) {
      return res.status(400).send(`Error: ${error.message}`);
    }
  }

  // Otherwise, treat it as a slug and redirect
  const row = findBySlug.get(param);
  if (!row) {
    return res.status(404).send('Short URL not found');
  }

  incrementHits.run(param);
  return res.redirect(302, row.long_url);
});

app.get('/u/w/:url', (req, res) => {
  const { url } = req.params;

  try {
    const longUrl = normalizeInput(url);
    const existing = findByLongUrl.get(longUrl);
    let slug, shortUrl;

    if (existing) {
      slug = existing.slug;
      shortUrl = `${BASE_URL}/u/${existing.slug}`;
    } else {
      slug = createUniqueSlug();
      insertUrl.run(slug, longUrl);
      shortUrl = `${BASE_URL}/u/${slug}`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Shortener</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .url-display {
            display: flex;
            gap: 10px;
            margin: 20px 0;
        }
        .url-input {
            flex: 1;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            background: #f9f9f9;
        }
        .copy-btn {
            padding: 12px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            transition: background 0.2s;
        }
        .copy-btn:hover {
            background: #0056b3;
        }
        .copy-btn.copied {
            background: #28a745;
        }
        .info {
            margin-top: 20px;
            padding: 15px;
            background: #e9ecef;
            border-radius: 5px;
            font-size: 14px;
        }
        .stats {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔗 URL Shortener</h1>

        <div class="url-display">
            <input type="text" class="url-input" id="shortUrl" value="${shortUrl}" readonly>
            <button class="copy-btn" id="copyBtn" onclick="copyToClipboard()">Copy</button>
        </div>

        <div class="info">
            <p><strong>Original URL:</strong> ${longUrl}</p>
            <div class="stats">
                <span><strong>Slug:</strong> ${slug}</span>
                <span><strong>Status:</strong> ${existing ? 'Reused existing' : 'Newly created'}</span>
            </div>
        </div>
    </div>

    <script>
        function copyToClipboard() {
            const urlInput = document.getElementById('shortUrl');
            const copyBtn = document.getElementById('copyBtn');

            navigator.clipboard.writeText(urlInput.value).then(() => {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');

                // Reset button after 2 seconds
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                // Fallback for older browsers
                urlInput.select();
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        }

        // Auto-copy on page load
        window.addEventListener('load', () => {
            setTimeout(copyToClipboard, 500);
        });
    </script>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    return res.status(400).send(`Error: ${error.message}`);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    usage: {
      create: `${BASE_URL}/u/<url>`,
      create_web: `${BASE_URL}/u/w/<url>`,
      open: `${BASE_URL}/u/<slug>`
    }
  });
});

app.listen(PORT, () => {
  console.log(`URL shortener listening on ${PORT}`);
});
