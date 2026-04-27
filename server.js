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

function isUrl(str) {
  return /^https?:\/\//i.test(str) || /^[^\s\/]+\.[^\s\/]+/i.test(str);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/u', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Shortener</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 640px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.08);
        }
        h1 {
            color: #222;
            text-align: center;
            margin-bottom: 24px;
        }
        .field {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
        }
        .field input {
            flex: 1;
            padding: 14px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
        }
        .field button,
        .copy-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.2;
            min-height: 40px;
            color: white;
            cursor: pointer;
            transition: background 0.2s ease;
        }
        .field button {
            background: #2563eb;
        }
        .field button:hover {
            background: #1d4ed8;
        }
        .result {
            margin-top: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .result input {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            background: #f9fafb;
        }
        .copy-btn {
            background: #16a34a;
        }
        .copy-btn.copied {
            background: #15803d;
        }
        .hint {
            margin-top: 16px;
            color: #4b5563;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>URL Shortener</h1>
        <div class="field">
            <input id="urlInput" type="text" placeholder="Enter a URL to shorten" autofocus>
            <button id="createBtn">Create</button>
        </div>
        <div class="result" style="display: none;">
            <input id="shortUrl" type="text" readonly>
            <button id="copyBtn" class="copy-btn">Copy</button>
        </div>
        <div class="hint">Paste a full URL, then click Create. The shortened URL will be copied automatically.</div>
    </div>
    <script>
        const urlInput = document.getElementById('urlInput');
        const createBtn = document.getElementById('createBtn');
        const shortUrlInput = document.getElementById('shortUrl');
        const copyBtn = document.getElementById('copyBtn');
        const resultSection = document.querySelector('.result');

        async function createShortUrl() {
            const rawUrl = urlInput.value.trim();
            if (!rawUrl) return;

            const encoded = encodeURIComponent(rawUrl);
            try {
                const response = await fetch('/u/' + encoded);
                if (!response.ok) {
                    const text = await response.text();
                    alert(text || 'Unable to shorten URL');
                    return;
                }

                const shortUrl = await response.text();
                shortUrlInput.value = shortUrl;
                resultSection.style.display = 'flex';
                copyToClipboard(shortUrl);
            } catch (error) {
                alert('Unable to shorten URL');
            }
        }

        function copyToClipboard(text) {
            const content = text || shortUrlInput.value;
            navigator.clipboard.writeText(content).then(() => {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(() => {
                shortUrlInput.select();
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        }

        createBtn.addEventListener('click', createShortUrl);
        urlInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') createShortUrl();
        });
        copyBtn.addEventListener('click', () => copyToClipboard());
    </script>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

app.get('/u/*', (req, res) => {
  const rawParam = req.params[0];
  const param = decodeURIComponent(rawParam || '').trim();

  // If it looks like a URL, create a short URL
  if (isUrl(param) || param.includes('/')) {
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

  const row = findBySlug.get(param);
  if (!row) {
    return res.status(404).send('Short URL not found');
  }

  incrementHits.run(param);
  return res.redirect(302, row.long_url);
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    usage: {
      ui: `${BASE_URL}/u`,
      create: `${BASE_URL}/u/<url>`,
      open: `${BASE_URL}/u/<slug>`
    }
  });
});

app.listen(PORT, () => {
  console.log(`URL shortener listening on ${PORT}`);
});
