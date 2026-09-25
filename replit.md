# Subscription Refactor Console

An interactive developer console for tracing a Clean Architecture subscription payment flow through deterministic demo adapters.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/subscription-refactor-console run dev` — run the web prototype
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/subscription-refactor-console/src/App.tsx` — single-page request lab UI and trace animation
- `artifacts/subscription-refactor-console/src/application/subscription.ts` — typed application use case and port contracts
- `artifacts/subscription-refactor-console/src/infrastructure/demo-adapters.ts` — deterministic in-memory adapters for demo scenarios
- `artifacts/subscription-refactor-console/src/index.css` — dark control-room theme and motion utilities

## Architecture decisions

- The prototype uses a local in-memory adapter set so it is safe to demo without Stripe, SMTP, or database credentials.
- `processSubscription` owns orchestration and depends on ports; adapters implement those ports and can be replaced without changing the use case.
- The demo preserves the legacy HTTP outcomes for the covered branches: 200 success, 403 suspended account, and 402 payment failure.
- The UI reveals the use-case trace after execution completes, then streams each recorded checkpoint to make dependency direction visible.

## Product

- Choose a controlled subscription scenario.
- Run the request through delivery, domain, application, and adapter boundaries.
- Inspect the lifecycle trace, result status, event, and raw input payload.
- Review the responsibility split across adapter, application, and domain layers.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The web artifact workflow supplies `PORT` and `BASE_PATH`; direct Vite build commands outside the workflow need those environment variables.
- This is a prototype seam, not a live payment implementation; production adapters still need to be connected behind the typed ports.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
