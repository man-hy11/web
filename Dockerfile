# web stub image — FE(정적 페이지) + BE(/health) 를 한 컨테이너에서 함께 실행
# healthcheck 용 curl 포함
FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app
COPY fe.js be.js logger.js ./
COPY public ./public

# FE_PORT/BE_PORT 는 compose environment 로 주입 (prod 55557/55558, dev 45557/45558)
# 두 stub 프로세스를 함께 기동 (concurrently 대용의 최소 구성)
CMD ["sh", "-c", "node fe.js & node be.js & wait"]
