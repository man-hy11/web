// web BE — items CRUD 를 db-service 에 위임하는 API 게이트웨이
// PostgreSQL 직접 접근 금지: 모든 데이터는 db-service HTTP API 경유
// 인증: 단일 계정(.env WEB_ADMIN_*) + 서버 메모리 세션 쿠키(sid).
// 메모리 세션이라 재시작 시 전원 로그아웃 — 랩 환경에서 허용된 트레이드오프.
const http = require('http');
const crypto = require('crypto');

const { createLogger } = require('./logger');

const log = createLogger('be');

const port = parseInt(process.env.BE_PORT || '55558', 10);
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://db-service:55555';
const ADMIN_USER = process.env.WEB_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.WEB_ADMIN_PASSWORD || ''; // 빈 값이면 로그인 불가 (fail-closed)
const SESSION_TTL_SEC = parseInt(process.env.SESSION_TTL_HOURS || '24', 10) * 3600;

const sessions = new Map(); // token(64hex) → 만료시각(ms)

// 쿠키 인증에는 Allow-Origin 와일드카드를 못 쓰므로 요청 Origin 을 echo.
// 로컬 랩 전제 — 외부 노출 시 Origin 화이트리스트로 교체할 것.
function cors(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(res, code, obj, headers) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function sessionToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)sid=([0-9a-f]{64})/);
  return m ? m[1] : null;
}

function isAuthed(req) {
  const token = sessionToken(req);
  if (!token) return false;
  const expiry = sessions.get(token);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) { sessions.delete(token); return false; } // lazy cleanup
  return true;
}

http.createServer(async (req, res) => {
  const start = Date.now();
  res.on('finish', () => log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));
  const CORS = cors(req);
  const [path] = req.url.split('?');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && path === '/health') { // 무인증 (healthcheck / verify.sh 용)
    res.writeHead(200, { 'Content-Type': 'text/plain', ...CORS });
    res.end('be ok');
    return;
  }

  if (req.method === 'POST' && path === '/auth/login') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return json(res, 400, { error: 'invalid json body' }, CORS); }
    if (!body || typeof body !== 'object') return json(res, 400, { error: 'invalid json body' }, CORS);
    if (ADMIN_PASSWORD
        && safeEqual(body.username || '', ADMIN_USER)
        && safeEqual(body.password || '', ADMIN_PASSWORD)) {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_TTL_SEC * 1000);
      return json(res, 200, { user: ADMIN_USER }, {
        ...CORS,
        'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SEC}`,
      });
    }
    return json(res, 401, { error: 'invalid credentials' }, CORS);
  }

  if (req.method === 'POST' && path === '/auth/logout') {
    const token = sessionToken(req);
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { // 미로그인이어도 200 (멱등)
      ...CORS,
      'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
  }

  if (req.method === 'GET' && path === '/auth/me') {
    if (isAuthed(req)) return json(res, 200, { user: ADMIN_USER }, CORS);
    return json(res, 401, { error: 'unauthorized' }, CORS);
  }

  // /items* : 유효 세션 필수, db-service 로 그대로 전달 (쿼리스트링 포함 — req.url 사용)
  if (path === '/items' || /^\/items\/\d+$/.test(path)) {
    if (!isAuthed(req)) return json(res, 401, { error: 'unauthorized' }, CORS);
    try {
      let body;
      if (req.method === 'POST' || req.method === 'PUT') body = await readBody(req);
      const upstream = await fetch(`${DB_SERVICE_URL}${req.url}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: body || undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...CORS });
      res.end(text);
    } catch (e) {
      log(`ERROR ${req.method} ${req.url} ${e.message}`);
      json(res, 502, { error: `db-service unreachable: ${e.message}` }, CORS);
    }
    return;
  }

  json(res, 404, { error: 'not found' }, CORS);
}).listen(port, () => {
  console.log(`[web be] listening on :${port}, db-service=${DB_SERVICE_URL}`);
});
