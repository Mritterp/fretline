const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = 8934;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/fretline.html';
  const full = path.join(root, p);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full);
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'application/javascript; charset=utf-8'
      : ext === '.webmanifest' ? 'application/manifest+json'
      : ext === '.png' ? 'image/png'
      : 'application/octet-stream';
    // no-store: this is a local dev preview, never let the browser serve a
    // stale cached copy after an edit + rebuild.
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('listening on ' + port));
