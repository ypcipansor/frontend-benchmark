#!/usr/bin/env node
/**
 * Tiny static server that hosts the contract-compliant fixture app and records
 * the interaction events it receives, so the regression tests can prove *which*
 * row a script acted on instead of trusting row order.
 *
 * --flags is a JSON object injected as window.FIXTURE_FLAGS, letting a test
 * break one behaviour at a time (a failing capture, a broken toggle-all, a
 * missing favicon, an unrelated 404 asset) without touching production code.
 *
 * Usage: node docs/tests/lib/fixture-server.js --port 4100 [--prefix /todo] [--flags '{...}']
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const FAVICON = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { port: 4100, prefix: '', flags: {} };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--port') o.port = Number(a[++i]);
    else if (a[i] === '--prefix') o.prefix = a[++i];
    else if (a[i] === '--flags') o.flags = JSON.parse(a[++i]);
  }
  return o;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function start(opts) {
  const flags = opts.flags || {};
  const events = [];
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (req.method === 'POST' && url === opts.prefix + '/__events') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try { events.push(JSON.parse(body)); } catch { /* ignore malformed */ }
        res.writeHead(204).end();
      });
      return;
    }

    if (url === opts.prefix + '/__events') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(events));
      return;
    }

    if (url === '/favicon.ico') {
      if (flags.faviconMissing) return void res.writeHead(404).end('no favicon');
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      return void res.end(FAVICON);
    }

    let rel = url.slice(opts.prefix.length) || '/';
    if (rel === '/') rel = '/app.html';
    const file = path.join(FIXTURES, path.normalize(rel).replace(/^\/+/, ''));
    if (!file.startsWith(FIXTURES) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = fs.readFileSync(file);
    if (path.extname(file) === '.html') {
      let text = body.toString('utf8');
      const injected =
        `<link rel="icon" href="/favicon.ico">\n` +
        `<script>window.FIXTURE_FLAGS = ${JSON.stringify(flags)};` +
        `window.FIXTURE_COUNT = ${Number(flags.count ?? 100)};</script>\n` +
        (flags.brokenAsset ? '<img src="/definitely-missing-asset.png" alt="" hidden>\n' : '');
      text = text.replace('</head>', injected + '</head>');
      body = Buffer.from(text);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  server.listen(opts.port, '127.0.0.1');
  return server;
}

if (require.main === module) {
  const opts = parseArgs();
  const server = start(opts);
  server.on('listening', () => console.log(`fixture server on http://127.0.0.1:${opts.port}${opts.prefix}/`));
}

module.exports = { start };

