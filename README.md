# URL Shortener

A lightweight, efficient URL shortener service built with Express.js and SQLite. Converts long URLs into short, memorable slugs and tracks click counts.

## Features

- **Simple URL Shortening**: Convert any URL into a compact, base62-encoded slug
- **Intelligent Reuse**: Returns existing slugs for previously shortened URLs
- **Click Tracking**: Automatically counts each redirect to track popularity
- **Info Endpoint**: Retrieve metadata about any shortened URL
- **Health Check**: Built-in health endpoint for monitoring
- **Efficient Storage**: Uses SQLite with WAL mode and indexed queries
- **URL Validation**: Automatic protocol normalization and validation

## Installation

### Prerequisites

- Node.js 18+ (uses ES modules)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd short-url
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will listen on port 3000 by default.

## Configuration

Configure the server using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `BASE_URL` | `https://ekkis.id` | Base URL for shortened links |
| `DB_PATH` | `./urls.db` | Path to SQLite database file |

Example:
```bash
PORT=8080 BASE_URL=https://short.example.com npm start
```

## API Endpoints

### Create/Get Short URL

**Endpoint**: `GET /s/<url>`

Creates a new shortened URL or returns an existing one for the same long URL.

**Parameters**:
- `url` (path): URL-encoded or plain URL to shorten

**Response** (201 Created):
```json
{
  "short_url": "https://ekkis.id/u/abc123",
  "slug": "abc123",
  "long_url": "https://example.com/very/long/path",
  "reused": false
}
```

**Response** (when reusing existing slug):
```json
{
  "short_url": "https://ekkis.id/u/abc123",
  "slug": "abc123",
  "long_url": "https://example.com/very/long/path",
  "created_at": "2024-01-15T10:30:00Z",
  "reused": true
}
```

### Redirect to Original URL

**Endpoint**: `GET /u/<slug>`

Redirects to the original long URL and increments the hit counter.

**Parameters**:
- `slug` (path): Short slug identifier

**Response**: 302 redirect to original URL

### Get URL Info

**Endpoint**: `GET /u/<slug>/info`

Retrieves metadata about a shortened URL without redirecting.

**Parameters**:
- `slug` (path): Short slug identifier

**Response** (200 OK):
```json
{
  "short_url": "https://ekkis.id/u/abc123",
  "long_url": "https://example.com/very/long/path",
  "created_at": "2024-01-15T10:30:00Z",
  "hit_count": 42
}
```

### Health Check

**Endpoint**: `GET /health`

Returns server status.

**Response** (200 OK):
```json
{
  "ok": true
}
```

## Usage Examples

### Create a short URL

```bash
curl "http://localhost:3000/s/https://example.com/very/long/url"
```

### Open a shortened URL

```bash
# Browser
curl -L "http://localhost:3000/u/abc123"
```

### Check statistics

```bash
curl "http://localhost:3000/u/abc123/info"
```

## Database Schema

The SQLite database includes the following table:

```sql
CREATE TABLE urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  long_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hit_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_urls_slug ON urls(slug);
CREATE UNIQUE INDEX idx_urls_long_url ON urls(long_url);
```

**Columns**:
- `id`: Unique identifier
- `slug`: Short URL identifier (base62 encoded)
- `long_url`: Original URL
- `created_at`: Timestamp of creation
- `hit_count`: Number of times the short URL was accessed

## Deployment

### Production Setup with Systemd and Nginx

This is the recommended production setup. It includes automatic service restart, systemd integration, and a reverse proxy.

#### Step 1: Prepare the Application

```bash
# Create application directory
sudo mkdir -p /opt/short-url /var/lib/short-url

# Create dedicated service user
sudo useradd -r -m -d /opt/short-url shorturl

# Copy application files
sudo cp server.js package.json package-lock.json /opt/short-url/
sudo cp short-url.service /etc/systemd/system/

# Set permissions
sudo chown -R shorturl:shorturl /opt/short-url /var/lib/short-url
sudo chmod 755 /opt/short-url /var/lib/short-url

# Install dependencies
cd /opt/short-url
sudo npm install --production
```

#### Step 2: Install Systemd Service

```bash
# Reload systemd daemon to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable short-url

# Start the service
sudo systemctl start short-url

# Verify it's running
sudo systemctl status short-url

# View logs
sudo journalctl -u short-url -f
```

#### Step 3: Configure Nginx Reverse Proxy

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/short-url

# Edit the configuration to match your domain(s)
sudo nano /etc/nginx/sites-available/short-url
```

Update the `server_name` directive in nginx.conf to your domain(s):
```nginx
server_name yourdomain.com www.yourdomain.com;
```

Then enable the site and restart nginx:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/short-url /etc/nginx/sites-enabled/short-url

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

#### Service Management

```bash
# View service status
sudo systemctl status short-url

# Start/stop/restart service
sudo systemctl start short-url
sudo systemctl stop short-url
sudo systemctl restart short-url

# View logs (last 50 lines)
sudo journalctl -u short-url -n 50

# Follow logs in real-time
sudo journalctl -u short-url -f

# Check if service auto-restarts on failure
sudo systemctl status short-url
```

#### SSL/TLS Configuration

For HTTPS, use Let's Encrypt with Certbot:

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
sudo systemctl status certbot.timer
```

### Alternative: Quick Start with PM2

For development or simpler setups, use PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name "url-shortener"

# Configure auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs url-shortener

# Manage process
pm2 restart url-shortener
pm2 stop url-shortener
pm2 delete url-shortener
```

## How It Works

1. **URL Normalization**: Input URLs are decoded, normalized, and validated to ensure they use http/https protocols
2. **Slug Generation**: Random 5-byte slugs are generated using base62 encoding of crypto-random bytes
3. **Duplicate Detection**: Before storing a new URL, the system checks if it has already been shortened
4. **Reuse**: If a duplicate is found, the existing slug is returned without creating a new entry
5. **Tracking**: Each redirect increments the hit counter for analytics

## Dependencies

- **express**: Web framework for Node.js
- **better-sqlite3**: Fast SQLite3 database bindings
- **crypto**: Node.js built-in module for random slug generation

## License

[Add your license here]
