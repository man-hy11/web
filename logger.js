// logger.js — 파일 + stdout 로깅 (외부 의존성 없음, 기록 실패해도 서비스는 계속)
// rotation: LOG_MAX_BYTES(기본 5MB) 초과 시 .1→.2→…→.LOG_KEEP(기본 3) 시프트
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR_IN_CONTAINER || '/logs';
const MAX_BYTES = parseInt(process.env.LOG_MAX_BYTES || String(5 * 1024 * 1024), 10);
const KEEP = parseInt(process.env.LOG_KEEP || '3', 10);

function rotateIfNeeded(file) {
  let size;
  try { size = fs.statSync(file).size; } catch (e) { return; } // 파일 없으면 rotation 불필요
  if (size < MAX_BYTES) return;
  for (let i = KEEP - 1; i >= 1; i--) {
    const src = `${file}.${i}`;
    if (fs.existsSync(src)) fs.renameSync(src, `${file}.${i + 1}`); // .KEEP 은 덮어써서 폐기
  }
  fs.renameSync(file, `${file}.1`);
}

function createLogger(name) {
  const file = path.join(LOG_DIR, `${name}.log`);
  return function log(line) {
    const msg = `[${new Date().toISOString()}] ${line}`;
    console.log(msg);
    try {
      rotateIfNeeded(file);
      fs.appendFileSync(file, msg + '\n');
    } catch (e) { /* /logs 미마운트 등 — stdout 만 유지 */ }
  };
}

module.exports = { createLogger };
