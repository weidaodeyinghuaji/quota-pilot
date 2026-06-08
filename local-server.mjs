import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const host = '127.0.0.1';
const port = 1420;

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/newapi-proxy')) {
      await proxyNewApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`Codex Quota Glance listening at http://${host}:${port}/`);
});

async function proxyNewApi(request, response) {
  const target = request.headers['x-newapi-target'];
  if (typeof target !== 'string') {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Missing X-NewAPI-Target');
    return;
  }

  const targetUrl = new URL(target);
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unsupported target protocol');
    return;
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      Authorization: stringHeader(request.headers.authorization),
      'New-Api-User': stringHeader(request.headers['new-api-user']),
      Accept: stringHeader(request.headers.accept) || 'application/json'
    }
  });

  const body = await upstream.arrayBuffer();
  response.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(Buffer.from(body));
}

async function serveStatic(request, response) {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = normalize(join(root, requested));
  const filePath = resolved.startsWith(root) && existsSync(resolved) ? resolved : join(root, 'index.html');

  response.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000'
  });
  createReadStream(filePath).pipe(response);
}

function stringHeader(value) {
  return Array.isArray(value) ? value[0] : value || '';
}

function contentType(filePath) {
  const extension = extname(filePath);
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}
