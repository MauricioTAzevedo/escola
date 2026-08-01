# Technology Stack

**Analysis Date:** 2026-08-01

## Languages

**Primary:**
- TypeScript 5.9.3 (declared `^5.4.5` everywhere) - used in all 4 workspaces; no JavaScript source files exist
- All packages compile with `tsc`; the web app additionally uses JSX (`jsx: react-jsx`)

**Secondary:**
- SQL (Prisma schema/DDL) - `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`
- HTML/CSS - `apps/web/index.html`, `apps/web/src/index.css` (Tailwind directives)
- Product UI language is `pt-BR`; code identifiers/comments in English (`README.md:5-6`)

## Runtime

**Environment:**
- Node.js: README requires `>= 18.x` (`README.md:89`), but **no `engines` field exists in any package.json and no `.nvmrc`/`.node-version`** — requirement is documentation-only. Local dev machine runs Node v22.14.0.
- pnpm: README requires `>= 8.x` (`README.md:90`); local machine runs pnpm 11.15.1. Lockfile is `lockfileVersion: '9.0'` (`pnpm-lock.yaml:1`) which corresponds to pnpm 10/11. Note: pnpm 11 requires Node >= 22, so the README's "Node >= 18" is stale relative to current tooling.

**Package Manager:**
- pnpm workspaces (`pnpm-workspace.yaml`): `apps/*` and `packages/*`
- Lockfile: `pnpm-lock.yaml` present (6248 lines), committed
- Workspace protocol `workspace:*` used for internal deps (`apps/api/package.json:18-19`, `apps/web/package.json:12`)

## Frameworks

**Core:**
- Fastify 5.10.0 (`apps/api/package.json:27`) - backend HTTP framework, logger = pino (built-in)
- React 18.3.1 + react-dom 18.3.1 (`apps/web/package.json:18-19`) - SPA, rendered via `createRoot` + `StrictMode` (`apps/web/src/main.tsx`)
- Prisma ORM 5.22.0 (`@prisma/client` + `prisma` CLI, `apps/api/package.json:24,36`) - database access; SQLite in practice (see Anomalies)

**Routing/State (web):**
- react-router-dom 7.18.1 (v7 library mode) - `apps/web/package.json:20`
- @tanstack/react-query 5.101.3 - server-state fetching/caching
- zustand 4.5.7 - client state (auth store `apps/web/src/store/useAuthStore.ts`)

**Testing:**
- Vitest 1.6.1 (`apps/api/package.json:40`, `packages/bkt-engine/package.json:14`) - unit/integration; no vitest config files (defaults used)
- supertest 7.2.2 (`apps/api/package.json:37`) - HTTP assertions against `app.server` (`apps/api/tests/auth.test.ts:21`)

**Build/Dev:**
- Vite 6.4.3 (`apps/web/package.json:34`) - web bundler + dev server (port 3000, `/api` proxied to `http://localhost:3001` per `apps/web/vite.config.ts:6-14`)
- @vitejs/plugin-react 4.7.0 - React fast-refresh plugin
- tsx 4.23.1 (`apps/api/package.json:38`) - API dev runner (`tsx watch src/index.ts`) and Prisma seed runner
- Tailwind CSS 3.4.19 + autoprefixer 10.5.4 + postcss 8.5.20 (`apps/web/package.json:29,32,33`) - styling (`apps/web/tailwind.config.js`, `apps/web/postcss.config.js`)
- ESLint 10.8.0 + typescript-eslint 8.65.0 (flat config, `eslint.config.js`) - linting
- Prettier 3.9.6 (`.prettierrc`: semi, singleQuote, tabWidth 2, trailingComma es5, printWidth 100) - formatting

## Key Dependencies

**Critical:**
- @google/generative-ai 0.11.5 (`apps/api/package.json:23`) - Google Gemini AI integration (explanation generation, question drafting, study feedback)
- @fastify/helmet 13.1.0, @fastify/cors 11.3.0, @fastify/rate-limit 11.1.0 (`apps/api/package.json:20-22`) - security hardening (`apps/api/src/app.ts:19-57`)
- jsonwebtoken 9.0.3 (`apps/api/package.json:29`) - JWT access (1h) / refresh (7d) tokens (`apps/api/src/plugins/auth.ts:35-41`)
- bcryptjs 2.4.3 (`apps/api/package.json:25`) - password hashing
- zod 3.25.76 (`apps/api/package.json:30`) - request validation in routes + AI response schemas (`apps/api/src/ai/types.ts`)
- @react-pdf/renderer 4.5.1 (`apps/web/package.json:13`) - PDF exam generation (`apps/web/src/components/ExamPdfModal.tsx`), lazy-loaded via manual chunk
- katex 0.18.1 + @types/katex 0.16.8 (`apps/web/package.json:15-16`) - math rendering
- recharts 2.15.4 (`apps/web/package.json:21`) - mastery/progress charts
- lucide-react 0.378.0 (`apps/web/package.json:17`) - icons

**Infrastructure:**
- dotenv 16.6.1 (`apps/api/package.json:26`) - env loading at API boot (`apps/api/src/index.ts:4`)
- fastify-plugin 4.5.1 (`apps/api/package.json:28`) - plugin encapsulation (`apps/api/src/plugins/auth.ts:88`)
- @escola/bkt-engine, @escola/shared-types (workspace deps) - see Anomalies A6/A7

## Configuration

**Environment:**
- Loaded via dotenv in API (`apps/api/src/index.ts:1-4`); `.env` files exist at repo root, `apps/api/.env`, and `apps/api/.env.example` + `apps/web/.env.example` + root `.env.example` (contents of `.env*` not read per policy — see INTEGRATIONS.md for required vars)
- `.gitignore` excludes `.env`, `.env.local`, `*.db`, `dist/` (`/.gitignore`)

**Build:**
- Root `tsconfig.json`: target ES2022, module/moduleResolution NodeNext, strict, declaration+sourceMap (shared base)
- `apps/api/tsconfig.json`: extends root, outDir `./dist`, rootDir `./src` — CommonJS output (api package.json has no `"type": "module"`)
- `apps/web/tsconfig.json`: target ES2020, moduleResolution bundler, noEmit (typecheck only), jsx react-jsx, noUnusedLocals/Parameters
- `apps/web/vite.config.ts`: manualChunks splitting vendor-react / vendor-katex / vendor-charts / vendor-pdf / vendor-icons; `sourcemap: false`
- `apps/api` build script: `prisma generate && tsc` (`apps/api/package.json:8`); start: `node dist/index.js`
- `apps/web` build script: `tsc && vite build` (`apps/web/package.json:8`)
- Root scripts (`package.json:6-9`): `dev`/`build`/`test`/`lint` all run `pnpm --recursive` (pnpm runs in topological order, so `packages/*` compile before apps)

## Platform Requirements

**Development:**
- Node.js >= 18 (README) — practically 20+ (`@types/node` 20.19.43, `apps/api/package.json:35`); local v22.14.0
- pnpm >= 8 (README); lockfile generated by pnpm 10/11; local 11.15.1
- No Docker required (README:85-86); no Dockerfile exists anywhere in the repo

**Production:**
- Web: Vercel (Hobby) — root `vercel.json` + `apps/web/vercel.json` add strict security headers (CSP, X-Frame-Options, HSTS-adjacent, etc.) and an SPA rewrite `/:path* → /index.html`
- API: Render free web service per `README.md:50` (750 hrs/mo, sleeps after 15 min idle, ~30s cold start)
- DB: SQLite file-based (README claims; see Anomalies A1)

---

## Anomalies & Suspicious Findings

**A1. Prisma datasource provider mismatch (HIGH)**
- `apps/api/prisma/schema.prisma:1-4` declares `provider = "postgresql"` with `url = env("DATABASE_URL")`
- But `apps/api/prisma/migrations/migration_lock.toml:3` says `provider = "sqlite"`, the applied migration `apps/api/prisma/migrations/20260721231624_init/migration.sql` is SQLite dialect (`TEXT PRIMARY KEY`, `CURRENT_TIMESTAMP`), a `dev.db` exists (gitignored, not tracked), and README + `CODE_REVIEW_FINDINGS.md` describe SQLite throughout
- Impact: `prisma generate` / `prisma migrate dev` / `db:seed` will fail or regenerate against the wrong provider; `DATABASE_URL` is now required by the schema although nothing provides Postgres
- Fix: revert datasource to `provider = "sqlite"` + `url = "file:./dev.db"` (or explicitly migrate to Postgres and regenerate migrations)

**A2. README claims GitHub Actions CI — no CI exists**
- `README.md:54` states "GitHub Actions ... Automated linting, type-checking, and test suite on PRs"
- No `.github/` directory or workflow files exist anywhere in the repo (verified via glob)
- Impact: no automated validation; nothing enforces lint/test/build on PRs

**A3. Non-standard pnpm setting `overridePackageVersions`**
- `pnpm-workspace.yaml:17-19` uses `overridePackageVersions: { esbuild: '^0.25.0', vite: '^6.4.3' }` — not a documented pnpm setting (pnpm uses `overrides` in `pnpm-workspace.yaml`). It is silently ignored.
- Also `allowBuilds` (pnpm 11 style) duplicates `onlyBuiltDependencies` — redundant but harmless
- Impact: intended version pinning for esbuild/vite is not enforced by pnpm; vite is pinned only because `apps/web/package.json:34` declares `^6.4.3` directly
- Fix: replace with a real `overrides:` block if pinning is intended

**A4. `@types/katex` in `dependencies`**
- `apps/web/package.json:15` — type-only package belongs in `devDependencies`

**A5. Unused ESLint React plugins**
- `eslint-plugin-react` 7.37.5 and `eslint-plugin-react-hooks` 7.1.1 declared in `apps/web/package.json:30-31` but the only ESLint config (`eslint.config.js`) never references them — React code is linted with base recommended rules only; the plugins are dead deps (also no per-app eslint config exists)

**A6. `@escola/bkt-engine` unused (dead dependency)**
- Declared in `apps/api/package.json:18` but **never imported anywhere in `apps/api/src`** (grep verified). The API contains no attempt-scoring/mastery-update code at all (no `attempt.create`, no `newPL` update, no `pTransit`/`pSlip` math outside the `StudentMastery` seeding in `apps/api/src/routes/kcs.ts:78-82`)
- The BKT engine only has its own tests (`packages/bkt-engine/tests/bkt.test.ts`, `policy.test.ts`); the adaptive loop is not wired end-to-end

**A7. `@escola/shared-types` unused in API**
- Declared in `apps/api/package.json:19` but only `apps/web/src` imports it (5 files: `useAuthStore.ts`, `Login.tsx`, `TeacherSubjects.tsx`, `BulkImportExportModal.tsx`, `ExamPdfModal.tsx`)

**A8. Outdated major versions**
- Vitest 1.6.1 (current major line is 3.x/4.x in 2026); Prisma 5.22.0 (6.x is current); `@google/generative-ai` 0.11.5 (Google's current SDK is `@google/genai`; the old package is legacy); `eslint-plugin-react-hooks` 7.1.1 targets the React 19 era rules

**A9. Version requirements not machine-enforced**
- No `engines` field in any of the 5 package.json files; no `.nvmrc`/`.node-version`; README's Node >= 18 conflicts with pnpm 11's Node >= 22 requirement

**A10. No web tests**
- `apps/web` has no `test` script and zero test files; root `pnpm test` only exercises api + bkt-engine

---

*Stack analysis: 2026-08-01*
