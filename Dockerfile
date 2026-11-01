# The yavc.app engine: one static Go binary, PUDL, and the installed applet
# packages, in a small image. Sessions live in /data, a volume.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /yavc ./cmd/yavc
RUN mkdir -p /md && GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o /md/yavc-md.wasm ./cmd/yavc-md \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /md/

FROM alpine:3.20
RUN adduser -D -H yavc
WORKDIR /app
COPY --from=build /yavc /app/yavc
COPY web/pudl /app/web/pudl
COPY applets /app/applets
COPY apps /app/apps
COPY --from=build /md/ /app/apps/editor/md/
COPY pages /app/pages
COPY site /app/site
RUN mkdir -p /data && chown yavc /data
USER yavc
EXPOSE 8400
ENTRYPOINT ["/app/yavc", "-addr", "0.0.0.0:8400", "-applets", "/app/applets,/app/apps", "-pudl", "/app/web/pudl", "-pages", "/app/pages", "-bin", "/app/site/bin", "-data", "/data"]
CMD ["-domain", "yavc.app", "-secure"]
