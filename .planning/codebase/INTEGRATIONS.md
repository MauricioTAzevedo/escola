# External Integrations

**Analysis Date:** 2026-08-01

## APIs & External Services

**AI Provider (Google Gemini):**
- Service: Google Gemini API (free tier: 15 RPM / 1,500 RPD per `README.md:52`)
- SDK/Client: `@google/generative-ai` 0.11.5 (`apps/api/package.json:23`) — legacy package; Google's current SDK is `@google/genai`
- Implementation: `apps/api/src/ai/GeminiAiTutorService.ts` (implements `IAiTutorService` from `apps/api/src/ai/types.ts`)
- Auth: `GEMINI_API_KEY` env var (`GeminiAiTutorService.ts:151`); client is only initialized if the key is set and not the placeholder `'your-gemini-api-key-here'` (`GeminiAiTutorService.ts:152`)
- Model selection: `GEMINI_MODEL` env var overrides; default fallback chain `gemini-3.1-flash-lite` → `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-2.0-flash-lite` → `gemini-2.0-flash` (`GeminiAiTutorService.ts:157-170`), each tried in order on failure
- Response handling: `responseMimeType: 'application/json'`; custom JSON extraction + LaTeX backslash fixing (`extractJsonObjectSubstring`, `fixJsonBackslashes` in `GeminiAiTutorService.ts:12-143`); zod validation via `AiExplanationResponseSchema`, `AiFeedbackResponseSchema`, `DraftQuestionListSchema` (`apps/api/src/ai/types.ts`)
- Rate limiting: in-process sliding-window limiter `new RateLimiter(12, 60000)` — 12 RPM, safely under the 15 RPM free tier (`GeminiAiTutorService.ts:148`, `apps/api/src/ai/RateLimiter.ts`)
- Graceful degradation: falls back to static pt-BR feedback when no key or on limiter/API failure (`README.md:134`)
- Endpoints: `POST /api/ai/generate-questions`, `POST /api/ai/transform-question` (`apps/api/src/routes/ai.ts`)

**Fonts (Web):**
- Google Fonts (Inter 300-700) loaded via external `<link>` in `apps/web/index.html:12-17`; permitted by CSP `style-src`/`font-src` in `apps/web/vercel.json` and root `vercel.json`

## Data Storage

**Database:**
- Prisma ORM 5.22.0 (`@prisma/client` + `prisma` CLI, `apps/api/package.json:24,36`); client singleton at `apps/api/src/lib/prisma.ts`
- **Actual provider: SQLite** — `apps/api/prisma/migrations/migration_lock.toml:3` (`provider = "sqlite"`), SQLite-dialect migration `apps/api/prisma/migrations/20260721231624_init/migration.sql`, local `apps/api/prisma/dev.db` (gitignored). README documents SQLite + ephemeral-filesystem caveats and the backup endpoint `GET /api/admin/export-db` (`README.md:56-60`, `apps/api/src/routes/admin.ts`)
- **Schema mismatch (anomaly):** `apps/api/prisma/schema.prisma:1-4` now declares `provider = "postgresql"` + `url = env("DATABASE_URL")` — inconsistent with the SQLite lockfile/migrations; `prisma generate`/`migrate` will conflict
- Tables (all `@@map`ped to snake_case): `users`, `subjects`, `knowledge_components`, `questions`, `attempts`, `student_masteries`, `class_enrollments`, `ai_caches` (`apps/api/prisma/schema.prisma`)
- Seed: `prisma db seed` → `tsx prisma/seed.ts` (`apps/api/package.json:14-16`); demo accounts `prof.carlos@escola.edu.br` / `aluno.lucas@escola.edu.br` / `aluna.mariana@escola.edu.br` / `aluno.pedro@escola.edu.br` (password `senha123`, `README.md:119-128`)

**File Storage:**
- Local filesystem only; no object-storage integration (question `imageUrl` field is just a URL string, `schema.prisma:73`)

**Caching:**
- AI response cache: SQLite `ai_caches` table via Prisma — SHA-256 hash of request parts as key, 72h TTL (`apps/api/src/ai/AiCacheService.ts:32-56`); read/write failures degrade to cache miss (try/catch + `console.warn`)
- In-process rate limiter queues (no Redis/external cache)

## Authentication & Identity

**Auth Provider:** Self-hosted (custom JWT)
- Implementation: `jsonwebtoken` 9.0.3 in `apps/api/src/plugins/auth.ts` — access token 1h (`type: 'access'`), refresh token 7d (`type: 'refresh'`); refresh flow in `apps/api/src/routes/auth.ts`; `authenticate` + `requireRole(['STUDENT'|'TEACHER'|'ADMIN'])` preHandlers
- Passwords: `bcryptjs` 2.4.3 hashing (`apps/api/src/routes/auth.ts`)
- Env: `JWT_SECRET`, `JWT_REFRESH_SECRET` — **required in production** (throws at boot when missing, `plugins/auth.ts:21-27`); dev fallback secrets hardcoded (`plugins/auth.ts:29-32`)
- Web side: bearer token in `localStorage` + automatic refresh interceptor (`apps/web/src/lib/api.ts:14-40`); auth state in zustand store `apps/web/src/store/useAuthStore.ts`; route guarding via `apps/web/src/components/ProtectedRoute.tsx`

## Monitoring & Observability

**Error Tracking:** None (no Sentry/other)
**Logs:** Fastify built-in pino logger — `logger: { level: process.env.LOG_LEVEL || 'info' }`, disabled in tests (`apps/api/src/app.ts:15`); ad-hoc `console.error`/`console.warn` throughout API services

## CI/CD & Deployment

**Hosting:**
- Web: Vercel (Hobby tier) — root `vercel.json` + `apps/web/vercel.json`: SPA rewrite `/:path* → /index.html` plus security headers (CSP `default-src 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy)
- API: Render free web service per `README.md:50` (750 hrs/mo, sleeps after 15 min, ~30s cold starts) — no deploy config (render.yaml/Procfile) present in repo

**CI Pipeline:**
- **None.** README (`README.md:54`) claims GitHub Actions on PRs, but no `.github/workflows` exists — no lint/typecheck/test automation is actually configured

## Environment Configuration

**Required env vars (API, `apps/api/src`):**
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — required in production (`apps/api/src/plugins/auth.ts:18-27`)
- `GEMINI_API_KEY`, `GEMINI_MODEL` (optional override) (`apps/api/src/ai/GeminiAiTutorService.ts:151,158`)
- `PORT` (default 3001), `HOST` (default 0.0.0.0) (`apps/api/src/index.ts:8-9`)
- `NODE_ENV` (controls CSP, error detail, logger), `LOG_LEVEL` (`apps/api/src/app.ts:15,20,77`)
- `ALLOWED_ORIGINS` (comma-separated CORS whitelist; defaults to localhost:3000/5173) (`apps/api/src/app.ts:25-32`)
- `DATABASE_URL` — referenced by `schema.prisma:3` but not consumed by any runtime code today (SQLite in use)

**Required env vars (Web):**
- `VITE_API_URL` (default `/api`, dev-proxied) (`apps/web/src/lib/api.ts:1`, `apps/web/src/vite-env.d.ts`)

**Secrets location:**
- `.env` files exist at repo root and `apps/api/.env` (present on disk, gitignored, contents not read); `.env.example` templates at root, `apps/api/.env.example`, `apps/web/.env.example` (all committed per `git ls-files`); `.gitleaksignore` present at repo root

## Webhooks & Callbacks

**Incoming:** None
**Outgoing:** None (API is request/response only; Gemini calls are synchronous from the service layer)

---

*Integration audit: 2026-08-01*
