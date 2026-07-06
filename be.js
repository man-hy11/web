// web BE — items CRUD 를 db-service 에 위임하는 API 게이트웨이
// PostgreSQL 직접 접근 금지: 모든 데이터는 db-service HTTP API 경유
// TODO(next stage): 실제 비즈니스 로직, 인증 추가 예정
const http = require('http');

const { createLogger } = require('./logger');

const log = createLogger('be');

const port = parseInt(process.env.BE_PORT || '55558', 10);
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://db-service:55555';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

http.createServer(async (req, res) => {
  const start = Date.now();
  res.on('finish', () => log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));
  const [path] = req.url.split('?');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', ...CORS });
    res.end('be ok');
    return;
  }

  // /items* 요청은 그대로 db-service 로 전달
  if (path === '/items' || /^\/items\/\d+$/.test(path)) {
    try {
      let body;
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await new Promise((resolve, reject) => {
          let d = '';
          req.on('data', (c) => { d += c; });
          req.on('end', () => resolve(d));
          req.on('error', reject);
        });
      }
      const upstream = await fetch(`${DB_SERVICE_URL}${path}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: body || undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...CORS });
      res.end(text);
    } catch (e) {
      log(`ERROR ${req.method} ${req.url} ${e.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: `db-service unreachable: ${e.message}` }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ error: 'not found' }));
}).listen(port, () => {
  console.log(`[web be] listening on :${port}, db-service=${DB_SERVICE_URL}`);
});
