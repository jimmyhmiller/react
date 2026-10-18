import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(new URL('../dist', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
export function startServer(port = 4180) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const fileRoot = pathname.startsWith('/results/') ? resolve(root, '..') : root;
      const path = resolve(fileRoot, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
      if (!path.startsWith(fileRoot + sep)) { res.writeHead(403); res.end(); return; }
      const contents = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(contents);
    } catch { res.writeHead(404); res.end('Not found. Run npm run build first.'); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await startServer(Number(process.env.PORT ?? 4180));
  console.log(`DRAW: http://127.0.0.1:${process.env.PORT ?? 4180}/`);
}
