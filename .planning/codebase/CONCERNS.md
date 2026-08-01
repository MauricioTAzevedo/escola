# Codebase Concerns

**Analysis Date:** 2026-08-01

Focus: security, auth, authorization, AI integration, secrets, deployment & supply-chain risks (defensive review only — no exploit code).

## Secret Exposure Findings

**Live credentials in on-disk `.env` files (Critical):**
- `apps/api/.env` and root `.env` contain real-looking production secrets, identical in both files: Neon PostgreSQL `DATABASE_URL` (115-char `postgresql://...`), Google Gemini key in real `AIza...` format (41 chars), and JWT secrets.
- JWT secrets are **word-based passphrases** (61/56 chars, ~47/46 lowercase chars, beginning with `"super...` — values include literal surrounding double-quotes, a quoting artifact) rather than random values. Low effective entropy; dictionary/brute-force risk if leaked. Both files share the same two JWT secrets.
- Mitigation in place: `.gitignore` (`.gitignore:11-12`) covers `.env`/`.env.local`; `git ls-files` confirms only `.env.example` files are tracked; `git log -p` shows no `.env` ever committed and no `AIza...` string in history. No hardcoded keys in source (grep for `AIza|sk-|AKIA|ghp_|BEGIN PRIVATE KEY` clean).
- Gaps: `.gitignore` does NOT cover `.env.production`, `.env.staging` or other `.env.*` variants; secrets duplicated across two files; no `gitleaks.toml` (only `.gitleaksignore` covering 4 test-fixture lines in `apps/api/tests/auth.test.ts`).
- **Recommendation:** rotate all three secret types (Neon password, Gemini key, both JWT secrets); generate 32+ char random secrets; consolidate to a single env source; add `.env.*` to `.gitignore`; store secrets in Render dashboard env vars only.

**Hardcoded credentials in seed (Medium):**
- `apps/api/prisma/seed.ts` hashes hardcoded password `senha123` for the teacher account and is destructive (deletes all tables before seeding). Never run against production data.

## Auth Implementation Review

**Sound:**
- `bcryptjs` cost 10 (`apps/api/src/routes/auth.ts:47,116`); registration role enum limited to `STUDENT|TEACHER` (`auth.ts:14`) — self-elevation to ADMIN closed (was SEC-02 in `CODE_REVIEW_FINDINGS.md`).
- Production refuses to boot without JWT secrets (`apps/api/src/plugins/auth.ts:21-27`); access token 1h / refresh 7d with `type` claim checks (`plugins/auth.ts:35-49,62-64`).

**Weaknesses:**
- `jwt.verify` calls never pin `algorithms: ['HS256']` (`plugins/auth.ts:45,60`) — algorithm-confusion hardening missing (low risk with string secret, but pin it).
- Effective JWT secret quality depends entirely on the weak `"super...` values in `.env` (see above). Dev fallback secrets still embedded (`plugins/auth.ts:29-32`).
- Refresh tokens are stateless: no revocation/versioning. Rotation happens client-side (`apps/web/src/lib/api.ts:56-62`) but old refresh tokens stay valid (replay possible for 7d). `POST /api/auth/logout` is a no-op (`auth.ts:173-175`) — SEC-08 still open.
- Tokens in `localStorage` (`apps/web/src/store/useAuthStore.ts:20-21`) — XSS-exposed (SEC-07 still open).
- No email verification, no account lockout beyond IP rate limit (10/min on login, `auth.ts:93-98`).

## Admin Endpoint Review

- `GET /api/admin/export-db` is now ADMIN-only via `requireRole(['ADMIN'])` (`apps/api/src/routes/admin.ts:10`) — SEC-04 fixed.
- **Stale artifact:** it reads `path.resolve(process.cwd(), 'dev.db')` — SQLite. The DB migrated to PostgreSQL (`apps/api/prisma/schema.prisma:1-4`); in production the file doesn't exist → 404. Endpoint is dead code and would dump raw data (incl. password hashes) if a SQLite file ever appears in the workdir. Consider removing it.
- **No admin bootstrap path:** registration forbids ADMIN and `seed.ts` creates only a TEACHER. There is no way to create an ADMIN user in production without manual DB access — operational gap.

## AI Integration Review

- **No SSRF:** official `@google/generative-ai` SDK; API endpoint is Google's fixed URL. Key read from `process.env.GEMINI_API_KEY` (`apps/api/src/ai/GeminiAiTutorService.ts:151`) and never sent to the client.
- **Prompt injection surface:** teacher-supplied `rawText`, `statement`, `kcName` interpolated verbatim into prompts (`GeminiAiTutorService.ts:222-241, 310-348, 368-396`). AI output is parsed with Zod schemas but **not run through `sanitizeString`** before being returned (`apps/api/src/routes/ai.ts:46-49`). Storage path via `POST /api/questions` does sanitize. Residual chain: teacher text → Gemini → KaTeX `dangerouslySetInnerHTML` sink in `apps/web/src/components/ui/FormattedText.tsx:306-314` (`katex.renderToString(..., { throwOnError: false })`). KaTeX 0.18.1 defaults `trust:false` and escapes error text, which contains the risk, but this is the single raw-HTML sink in the app — treat math input as untrusted; consider explicit `trust: false` + output escaping.
- **Info disclosure:** Gemini `err.message` (model names, quota/rate-limit details) returned to clients at `routes/ai.ts:51-55` and `routes/ai.ts:102-106` (wrapped via `GeminiAiTutorService.ts:357,404,430`).
- **Cost/DoS:** `rawText` has no maximum length (`routes/ai.ts:7`, min 20 only) — unbounded prompt size drives Gemini spend; capped only by 10 req/min per-IP route limit.
- `AiCacheService` stores hashed keys + plaintext responses (question text, student answers) for 72h in Postgres (`apps/api/src/ai/AiCacheService.ts:32-56`) — student-data at rest, no encryption.

## Input Validation Gaps

- All routes use hand-rolled Zod `safeParse` in-handler; **no Fastify JSON schemas, no schema-first validation** (`app.ts` registers routes without `schema`). Consistent but non-centralized; any future route can forget it.
- `sanitizeString` custom regex sanitizer (`apps/api/src/lib/sanitize.ts:6-25`) remains the write-path XSS defense (SEC-06 open): strips only `script/iframe/object/embed/svg`, `on*=` attrs, `javascript|vbscript|data:` URIs. Bypassable via entity-encoded handlers (`&#106;avascript:`), `style`/`url()`, MathML — recommend replacing with DOMPurify/sanitize-html. Applied to questions/KCs/subjects, NOT to AI draft output.
- Query params are cast with `as` without schema (`questions.ts:60`, `kcs.ts:40`, `teacher.ts:11,89`) — type-unsafe but Prisma parameterizes values; no raw SQL anywhere.
- Fastify default `bodyLimit` (1MB) applies — no per-route body limits beyond that; bulk import array length unbounded (`questions.ts:33-55`, no `.max()`).

## CORS / Headers

- CORS whitelist + `credentials: true`; requests with **no Origin are allowed** (`apps/api/src/app.ts:37-41`) — fine for curl/mobile, but combined with credentials means any non-browser client can call; browsers always send Origin so CSRF via browser is mitigated (Bearer header, not cookies).
- `@fastify/helmet` registered (`app.ts:19-22`); CSP **enabled only in production**.
- Vercel headers (`vercel.json`): strict CSP `script-src 'self'`, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy`, `Permissions-Policy` — good.
- **Deployment risk:** `vercel.json` rewrites `/:path*` → `/index.html` — every `/api/*` path on the Vercel domain returns 200 HTML. Web calls API via `VITE_API_URL` (`apps/web/src/lib/api.ts:1`); if that env var is unset/misconfigured, the SPA silently calls index.html and fails with confusing 200s.
- API on Render does not inherit `vercel.json` headers; helmet covers most, but there is no HSTS on Render (`helmet` sets HSTS by default — verify Render serves HTTPS).

## Error Leakage

- Global error handler (`apps/api/src/app.ts:73-91`): stack traces returned **only** in `NODE_ENV=development`; generic `Erro interno do servidor` for 5xx in prod — good. `console.error` still logs full errors including stack to stdout.
- Exceptions above: AI routes return raw `err.message` (`routes/ai.ts:51-55,102-106`) — internal Gemini details leak.
- Unhandled Prisma constraint errors (e.g. race on duplicate email) fall through to global handler → generic 500 — acceptable.

## Deployment Risks

- **Rate limiting broken behind proxy:** no `trustProxy` anywhere (`apps/api/src/index.ts`, `app.ts`). On Render (per `README.md:50`), all clients share the proxy's IP → `@fastify/rate-limit` global bucket (120/min, `app.ts:49-57`) and the login bucket (10/min) become **app-wide** limits: one heavy user can throttle everyone; conversely per-IP protection is effectively null. Set `trustProxy: true` (or `1`) and verify `request.ip` resolution.
- Free-tier Render: 512MB RAM, cold starts ~30s, ephemeral filesystem — incompatible with the SQLite-based `export-db` and the in-memory `RateLimiter` (12 RPM, `apps/api/src/ai/RateLimiter.ts`) if ever scaled to >1 instance.
- `.env` values include literal quote characters (`"super...`, `"AIza...`) — if these were copied into Render env vars verbatim, JWT verification and Gemini auth would behave unexpectedly; must be cleaned when rotating.
- No CI pipeline detected (no `.github/`), no secrets scanning in CI, no automated deploy pipeline beyond Vercel git integration.

## Supply Chain Notes

- `pnpm audit` findings (lockfile `pnpm-lock.yaml` committed):
  - **Critical:** `vitest <3.2.6` (GHSA-5xrq-8626-4rwp — arbitrary file read/exec via UI server) in `apps/api` and `packages/bkt-engine` (dev-only).
  - **High:** `vite <=6.4.2` `server.fs.deny` bypass (GHSA-fx2h-pf6j-xcff) via `vitest`'s transitive vite; direct web vite is 6.4.3 (patched).
  - **High:** `react-router >=7.12 <8.3` RSC-mode CSRF bypass (GHSA-qwww-vcr4-c8h2) — `apps/web` uses `react-router-dom ^7.18.1`, **in vulnerable range** (app does not use RSC mode, so practical risk low, but upgrade).
  - **High:** `brace-expansion <1.1.17` DoS (transitive).
- Older SDK versions: `@google/generative-ai ^0.11.1`, `@prisma/client ^5.14.0`, `vite ^6.4.3` — functional, but outdated majors.
- No dependabot/renovate config; no lockfile audit step in any workflow.

## Fragile Areas

- `apps/api/src/lib/sanitize.ts` — regex-based XSS defense relied on by all write paths; single bypass = stored XSS. Replace with a library.
- `apps/api/src/routes/teacher.ts:7-82` (`/analytics`): `activeSubjectId` taken from unvalidated `subjectId` query param, bypassing the teacher-scoped subject list (lines 14-19) — teacher A reads analytics of teacher B's subject (IDOR).
- `apps/api/src/routes/teacher.ts:85-119` (`/export-csv`): `subjectId` never checked against `teacher.teacherId` (subject fetched at line 95, ownership never compared) — any teacher can export any other teacher's question bank including `correctAnswer`/`explanation`; also CSV formula-injection (values not prefixed with `'`) and header injection risk via `subject?.name` in Content-Disposition (name is sanitized on write, low risk).
- `apps/api/src/routes/kcs.ts:90-122`: `PUT /:id` and `DELETE /:id` have **no ownership check at all** — any TEACHER can modify/delete any knowledge component (BOLA). Contrast with `subjects.ts:138-142,165-169` which do check.
- `apps/api/src/routes/questions.ts:59-91`: `GET /api/questions` is `authenticate`-only — returns `correctAnswer`, `explanation`, and `isApproved: false` (unpublished) questions to **any student**. Answer-key leak undermines the exam platform; recommend role-based field filtering and approval gating.
- `apps/web/src/components/ui/FormattedText.tsx:306-314` — sole `dangerouslySetInnerHTML` sink (KaTeX output, `throwOnError: false`).

## Test Coverage Gaps

- Only two test files exist: `apps/api/tests/auth.test.ts` (register/login/me happy paths — token lifecycle, logout, refresh rotation, role guards untested) and `apps/api/tests/ai.test.ts` (fallback + rate limiter only). **Priority: High** — no tests for the IDOR/BOLA endpoints (`teacher.ts`, `kcs.ts`), the export endpoints, sanitizer bypasses, or admin export.
- No E2E tests; no frontend tests; no tests for `sanitize.ts` (`.gitleaksignore` references sanitizer tests in `auth.test.ts:23-42` — those lines contain only register/login data, so sanitizer coverage is effectively absent).

## Missing Critical Features

- Refresh-token revocation / deny-list (logout does nothing — `auth.ts:173-175`).
- Admin bootstrap/creation flow (no path to create ADMIN in production).
- Server-side request-body limits per route; per-route rate limits for `/api/auth/refresh` (currently only global 120/min — token-guessing vector).
- Account lockout / failed-login throttling beyond IP-based limit.

---

*Concerns audit: 2026-08-01 (builds on CODE_REVIEW_FINDINGS.md dated 2026-07-31; statuses above reflect current code)*
