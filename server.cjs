// Static file server for local testing only. No upload or application endpoints.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const lan = process.argv.includes('--lan');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };
http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (file === root) file = path.join(root, 'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(8108, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('Room 108: http://localhost:8108');
  if (lan) {
    for (const entries of Object.values(require('node:os').networkInterfaces())) {
      for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal) console.log(`Phone test (same Wi-Fi): http://${entry.address}:8108`);
    }
  }
});
