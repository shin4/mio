# Mio App

Solid UI shared by the Mio desktop application. The app expects an agent
HTTP server, usually on `localhost:4096`, for full functionality.

## Development

From the repository root:

```bash
bun run dev:agent
bun run dev:app
```

Or from this package:

```bash
bun dev
```

## Verification

```bash
bun typecheck
```

Playwright E2E tests start the Vite dev server through their `webServer`
configuration and use a local agent backend by default.

```bash
bunx playwright install chromium
bun run test:e2e:local
```

Useful environment variables:

- `PLAYWRIGHT_SERVER_HOST` / `PLAYWRIGHT_SERVER_PORT` - backend address, default `localhost:4096`.
- `PLAYWRIGHT_PORT` - Vite dev server port, default `3000`.
- `PLAYWRIGHT_BASE_URL` - override the test base URL.
