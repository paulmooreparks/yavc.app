# The yavc.app engine: one static Go binary, PUDL, and the installed applet
# packages, in a small image. Sessions live in /data, a volume. Both images
# are pinned to an exact release, so a rebuild takes the same base until
# the pins are moved on purpose.
FROM golang:1.26.10-alpine3.24 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /yavc ./cmd/yavc
RUN mkdir -p /md && GOOS=js GOARCH=wasm go build -buildvcs=false -trimpath -ldflags="-s -w" -o /md/yavc-md.wasm ./cmd/yavc-md \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /md/
# The D2 engine (docs/diagrams-design.md), with the Go runtime's loader.
RUN mkdir -p /d2 && GOOS=js GOARCH=wasm go build -buildvcs=false -trimpath -ldflags="-s -w" -o /d2/yavc-d2.wasm ./cmd/yavc-d2 \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /d2/
COPY LICENSE ./
COPY apps ./apps
COPY web/pudl ./web/pudl
COPY scripts/fixtures ./scripts/fixtures
RUN go run ./cmd/yavc-content -out /content-release -md /md -d2 /d2

FROM alpine:3.24.3
RUN adduser -D -H yavc
WORKDIR /app
COPY --from=build /yavc /app/yavc
COPY web/pudl /app/web/pudl
COPY applets /app/applets
COPY apps /app/apps
# The priority applets and their shared assets come from the same release
# builder used by the independent-host proof. There is one implementation.
COPY --from=build /content-release/content/ /app/apps/
COPY --from=build /content-release/manifest.json /app/apps/content-kit/release.json
COPY pages /app/pages
COPY site /app/site
RUN mkdir -p /data && chown yavc /data
USER yavc
EXPOSE 8400
ENTRYPOINT ["/app/yavc", "-addr", "0.0.0.0:8400", "-applets", "/app/applets,/app/apps", "-pudl", "/app/web/pudl", "-pages", "/app/pages", "-bin", "/app/site/bin", "-home", "/app/site/home", "-data", "/data"]
CMD ["-domain", "yavc.app", "-secure"]
