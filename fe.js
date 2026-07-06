// web FE — items 관리 페이지 서버 (BE_PORT 를 페이지에 주입)
// TODO(next stage): 실제 프론트엔드(SPA 빌드 산출물 서빙 등)로 교체 예정
const http = require('http');
const fs = require('fs');
const path = require('path');

const { createLogger } = require('./logger');

const log = createLogger('fe');

const port = parseInt(process.env.FE_PORT || '55557', 10);
const bePort = process.env.BE_PORT || '55558';

const indexHtml = fs
  .readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace(/__BE_PORT__/g, bePort);

http.createServer((req, res) => {
  const start = Date.now();
  res.on('finish', () => log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(indexHtml);
}).listen(port, () => {
  console.log(`[web fe] listening on :${port} (BE port ${bePort})`);
});
