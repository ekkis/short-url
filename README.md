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

**Endpoint**: `GET /u/<url>`

Creates a new shortened URL or returns an existing one. Returns only the short URL as plain text.

**Parameters**:
- `url` (path): URL to shorten (will be auto-detected)

**Response** (plain text):
```
https://ekkis.id/u/abc123
```

### Create Short URL with Web Interface

**Endpoint**: `GET /u/w/<url>`

Creates a shortened URL and returns an HTML page with a copy button and auto-copy functionality.

**Parameters**:
- `url` (path): URL to shorten

**Response**: HTML page with short URL display and copy functionality

### Redirect to Original URL

**Endpoint**: `GET /u/<slug>`

Redirects to the original long URL and increments the hit counter. The slug is auto-detected as not being a URL.

**Parameters**:
- `slug` (path): Short slug identifier

**Response**: 302 redirect to original URL

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
curl "http://localhost:3000/u/https://example.com/very/long/url"
# Returns: https://ekkis.id/u/abc123
```

### Create short URL with web interface

```bash
# Open in browser for HTML interface with copy button
curl "http://localhost:3000/u/w/https://example.com/very/long/url"
```

### Open a shortened URL

```bash
# Browser redirect
curl -L "http://localhost:3000/u/abc123"
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

### Ubuntu with Systemd and Nginx

This is the recommended production setup for Ubuntu. It includes automatic service restart, systemd integration, and a reverse proxy.

#### Step 1: Prepare the Application

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js (if not already installed)
sudo apt-get install -y nodejs npm

# Create application directory
sudo mkdir -p /opt/short-url /var/lib/short-url

# Create dedicated service user
sudo useradd -r -m -d /opt/short-url shorturl

# Copy application files
sudo cp server.js package.json package-lock.json /opt/short-url/
sudo cp service /etc/systemd/system/short-url.service

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
# Install Nginx (if not already installed)
sudo apt-get install -y nginx

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

#### Service Management (Ubuntu)

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

#### SSL/TLS Configuration (Ubuntu)

For HTTPS, use Let's Encrypt with Certbot:

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
sudo systemctl status certbot.timer
```

### Alpine Linux with OpenRC and Nginx

Alpine is ideal for containerized deployments and lightweight servers. It uses OpenRC instead of systemd.

#### Step 1: Prepare the Application

```bash
# Update system packages
sudo apk update && sudo apk upgrade

# Install Node.js and npm
sudo apk add --no-cache nodejs npm

# Create application directory
sudo mkdir -p /opt/short-url /var/lib/short-url

# Create dedicated service user
sudo addgroup -S shorturl
sudo adduser -S -D -H -h /opt/short-url -s /sbin/nologin -G shorturl -g shorturl shorturl

# Copy application files
sudo cp server.js package.json package-lock.json /opt/short-url/
sudo cp openrc /etc/init.d/short-url

# Set permissions
sudo chown -R shorturl:shorturl /opt/short-url /var/lib/short-url
sudo chmod 755 /opt/short-url /var/lib/short-url

# Install dependencies
cd /opt/short-url
sudo npm install --production
```

#### Step 2: Install OpenRC Service

```bash
# Copy the OpenRC init script
sudo cp openrc /etc/init.d/short-url

# Edit the configuration to match your domain
sudo vi /etc/init.d/short-url
```

Update the environment variables in the script:
```bash
export PORT=3000
export BASE_URL=https://yourdomain.com
export DB_PATH=/var/lib/short-url/urls.db
```

Then make it executable:

```bash
# Make it executable
sudo chmod +x /etc/init.d/short-url
```

#### Step 3: Enable and Start Service

```bash
# Enable service to start on boot
sudo rc-update add short-url default

# Start the service
sudo rc-service short-url start

# Verify it's running
sudo rc-service short-url status

# View logs
sudo tail -f /var/log/messages
```

#### Step 4: Configure Nginx Reverse Proxy

```bash
# Install Nginx
sudo apk add --no-cache nginx

# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/http.d/short-url.conf

# Edit the configuration to match your domain(s)
sudo vi /etc/nginx/http.d/short-url.conf
```

Update the `server_name` directive to your domain(s):
```nginx
server_name yourdomain.com www.yourdomain.com;
```

Then enable and restart nginx:

```bash
# Test nginx configuration
sudo nginx -t

# Enable nginx on boot
sudo rc-update add nginx default

# Start/restart nginx
sudo rc-service nginx restart
```

#### Service Management (Alpine)

```bash
# View service status
sudo rc-service short-url status

# Start/stop/restart service
sudo rc-service short-url start
sudo rc-service short-url stop
sudo rc-service short-url restart

# View logs
sudo tail -f /var/log/messages

# Follow supervisor logs (if configured)
sudo tail -f /var/log/short-url.log
```

#### SSL/TLS Configuration (Alpine)

For HTTPS with Let's Encrypt:

```bash
# Install certbot
sudo apk add --no-cache certbot certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Set up auto-renewal with cron
sudo apk add --no-cache certbot-nginx-renewal
```

### Quick Start with PM2

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

### Docker Deployment

For containerized deployments using Alpine:

```bash
# Build image
docker build -t short-url:latest .

# Run container
docker run -d \
  --name short-url \
  -p 3000:3000 \
  -e PORT=3000 \
  -e BASE_URL=https://yourdomain.com \
  -v short-url-data:/var/lib/short-url \
  short-url:latest
```

## How It Works

1. **Smart Detection**: The system automatically detects whether `/u/<param>` is a URL to shorten or a slug to redirect based on URL patterns
2. **URL Normalization**: Input URLs are decoded, normalized, and validated to ensure they use http/https protocols
3. **Slug Generation**: Random 5-byte slugs are generated using base62 encoding of crypto-random bytes
4. **Duplicate Detection**: Before storing a new URL, the system checks if it has already been shortened
5. **Reuse**: If a duplicate is found, the existing slug is returned without creating a new entry
6. **Tracking**: Each redirect increments the hit counter for analytics
7. **Web Interface**: The `/u/w/` endpoint provides a user-friendly HTML interface with copy-to-clipboard functionality

## Dependencies

- **express**: Web framework for Node.js
- **better-sqlite3**: Fast SQLite3 database bindings
- **crypto**: Node.js built-in module for random slug generation

## License

[Add your license here]
