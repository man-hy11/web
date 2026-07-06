# web (FE + BE)

한 컨테이너에서 FE/BE 두 프로세스를 함께 실행합니다.

- FE: items 관리 페이지("Hello FE") — `FE_PORT` (prod 55557 / dev 45557)
- BE: items CRUD API 게이트웨이 — `BE_PORT` (prod 55558 / dev 45558), `GET /health` → `be ok`

**데이터 경로**: FE(브라우저) → BE → **db-service** → PostgreSQL.
BE는 PostgreSQL에 직접 접근하지 않으며(`DB_SERVICE_URL` 로 db-service 호출),
compose 네트워크 분리로 PostgreSQL에는 db-service만 접근할 수 있습니다.

## BE API
| Method | Path | 설명 |
|---|---|---|
| GET | /health | 헬스체크 → `be ok` |
| GET/POST | /items | 목록/생성 (db-service 위임) |
| PUT/DELETE | /items/:id | 수정/삭제 (db-service 위임) |

## TODO (다음 단계)
- [ ] FE 실제 화면 고도화 (빌드 파이프라인/nginx 검토)
- [ ] BE 실제 비즈니스 로직, 인증
- [ ] 파일 로깅 / log rotation
