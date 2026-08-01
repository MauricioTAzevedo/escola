# Architecture

**Analysis Date:** 2026-08-01

## Pattern Overview

**Overall:** Monorepo (pnpm workspaces) with a layered client-server architecture: React SPA (`apps/web`) consuming a REST API built on Fastify (`apps/api`), with two shared packages (`packages/bkt-engine`, `packages/shared-types`).

**Key Characteristics:**
- Feature-routed API: one Fastify route plugin file per resource, registered with URL prefixes in `apps/api/src/app.ts`
- Prisma ORM as the single data-access layer (all queries go through `src/lib/prisma.ts` singleton)
- PreHandler-based auth: `authenticate` and `requireRole([...])` from `apps/api/src/plugins/auth.ts` attached per-route via `preHandler`
- Service-layer abstraction for AI (interface `IAiTutorService` in `apps/api/src/ai/types.ts`, implementation `GeminiAiTutorService`) exposed through a singleton composition root (`apps/api/src/ai/AiTutorService.ts`)
- BKT engine isolated in a standalone pure-TS package (`packages/bkt-engine`) — currently declared as an API dependency but NOT yet imported by API source code
- Validation at the route boundary with zod schemas + XSS sanitization transforms (`apps/api/src/lib/sanitize.ts`)
- Frontend state via Zustand (`apps/web/src/store/useAuthStore.ts`), server state via TanStack Query (`apps/web/src/App.tsx`)

## Layers

**Presentation (Web):**
- Purpose: pt-BR UI for login, teacher dashboard, and subject/question management
- Location: `apps/web/src/`
- Contains: pages, UI primitives, modals, API client wrapper, auth store
- Depends on: `@escola/shared-types` (DTO types), REST API via `apps/web/src/lib/api.ts`
- Used by: browser (Vite dev server on :3000, proxy `/api` → :3001 per `apps/web/vite.config.ts`)

**API (Transport/Route layer):**
- Purpose: HTTP contract, auth guards, validation, rate limiting
- Location: `apps/api/src/routes/`
- Contains: one plugin file per resource (`auth.ts`, `subjects.ts`, `kcs.ts`, `questions.ts`, `ai.ts`, `teacher.ts`, `admin.ts`)
- Depends on: `../plugins/auth`, `../lib/prisma`, `../lib/sanitize`, `../ai/AiTutorService`
- Used by: web app; registered in `apps/api/src/app.ts`

**AI Service layer:**
- Purpose: Gemini-backed tutoring features (question generation, variants, explanations, study feedback) with cache + rate limiting + graceful fallback
- Location: `apps/api/src/ai/`
- Contains: `types.ts` (zod schemas + `IAiTutorService`), `GeminiAiTutorService.ts`, `AiCacheService.ts`, `RateLimiter.ts`, `AiTutorService.ts` (composition root)
- Depends on: `@google/generative-ai`, `../lib/prisma` (via AiCacheService), zod
- Used by: `apps/api/src/routes/ai.ts`

**Data access:**
- Purpose: ORM over SQLite/PostgreSQL
- Location: `apps/api/src/lib/prisma.ts` (singleton), schema at `apps/api/prisma/schema.prisma`
- Contains: 8 models (User, Subject, KnowledgeComponent, Question, Attempt, StudentMastery, ClassEnrollment, AiCache)
- Used by: all route plugins, AiCacheService, `apps/api/prisma/seed.ts`

**Shared packages:**
- `packages/shared-types/src/index.ts`: DTOs + domain unions shared web↔API (currently consumed only by web in source; API declares it but imports nothing from it)
- `packages/bkt-engine/src/`: pure math engine (`bkt.ts`: `calculatePosterior`, `updateMastery`) and question-selection policy (`policy.ts`: `AdaptivePolicy`, `RandomPolicy`)

## Data Flow

**Question management flow (teacher):**

1. `TeacherSubjects.tsx` (`apps/web/src/pages/TeacherSubjects.tsx`) calls `apiFetch('/subjects' | '/kcs?...' | '/questions?...')` via TanStack Query
2. `apiFetch` (`apps/web/src/lib/api.ts`) attaches `Authorization: Bearer <accessToken>` from localStorage; on 401 it transparently calls `/api/auth/refresh` and retries (single-flight via module-level `isRefreshing`)
3. Fastify route preHandler runs `authenticate`/`requireRole` (`apps/api/src/plugins/auth.ts`)
4. Route handler validates body/query with zod, applies `sanitizeString` transforms (`apps/api/src/lib/sanitize.ts`)
5. Prisma queries execute against the DB via `src/lib/prisma.ts`
6. Response goes through the global error handler in `apps/api/src/app.ts` (stack stripped unless `NODE_ENV=development`)

**Auth flow (login):**

1. `Login.tsx` → `apiFetch('/auth/login')` → `POST /api/auth/login` (rate-limited 10/min per route config in `apps/api/src/routes/auth.ts`)
2. `bcrypt.compare` against `user.passwordHash`; on success `generateTokens()` (`apps/api/src/plugins/auth.ts`) returns access (1h) + refresh (7d) JWTs
3. `setAuth` in `apps/web/src/store/useAuthStore.ts` persists both tokens to localStorage
4. `checkAuth()` on app boot (`apps/web/src/App.tsx` useEffect) validates via `GET /api/auth/me`

**AI generation flow:**

1. `AiQuestionGeneratorModal.tsx` (`apps/web/src/components/AiQuestionGeneratorModal.tsx`) → `POST /api/ai/generate-questions` (rate-limited 10/min)
2. Route calls singleton `aiTutorService.generateQuestionsFromContent(...)` (`apps/api/src/ai/AiTutorService.ts`)
3. `GeminiAiTutorService` gates on `RateLimiter.tryAcquire()` (12 req/min sliding window, `apps/api/src/ai/RateLimiter.ts`), then calls GoogleGenerativeAI with a model fallback chain (`apps/api/src/ai/GeminiAiTutorService.ts` `getCandidateModels`)
4. Raw model output is parsed by `safeParseGeminiJson` (extracts JSON object + repairs LaTeX backslashes) and validated with zod schemas (`apps/api/src/ai/types.ts`)
5. Results are cached in the `ai_caches` SQLite table by `AiCacheService` (sha256 key, 72h TTL, `apps/api/src/ai/AiCacheService.ts`)
6. On missing API key/rate-limit/parse failure, `generateExplanation`/`generateStudyFeedback` degrade to static pt-BR fallback strings; `generateQuestionsFromContent` throws (route returns 500)

**State Management:**
- Frontend: Zustand store for auth (`apps/web/src/store/useAuthStore.ts`); TanStack Query for server data with `retry: 1`, `refetchOnWindowFocus: false` (`apps/web/src/App.tsx`)
- Backend: stateless; no in-memory session state; JWT claims carry `userId`/`email`/`name`/`role` (`apps/api/src/plugins/auth.ts` `UserPayload`)

## API Endpoints

All routes are registered in `apps/api/src/app.ts` with prefixes. PreHandler auth: `authenticate` = valid access JWT; `requireRole([...])` = JWT + role check.

| Method | Path | Auth | Notes / File |
|---|---|---|---|
| GET | `/health` | Public | Liveness check, `apps/api/src/app.ts` |
| POST | `/api/auth/register` | Public | Creates user (bcrypt 10 rounds); auto-enrolls STUDENT into all subjects; returns tokens; `apps/api/src/routes/auth.ts` |
| POST | `/api/auth/login` | Public | Rate limit 10/min; returns access+refresh tokens |
| POST | `/api/auth/refresh` | Public (needs refresh token in body) | Issues new token pair from refresh JWT (type-checked) |
| POST | `/api/auth/logout` | Public | Stateless no-op message; client clears localStorage |
| GET | `/api/auth/me` | `authenticate` | Current user from DB |
| GET | `/api/subjects` | `authenticate` | Teacher sees own (`teacherId`), ADMIN sees all; `_count` aggregations; `apps/api/src/routes/subjects.ts` |
| GET | `/api/subjects/:id` | `authenticate` | + owner check (ADMIN bypass) |
| POST | `/api/subjects` | `requireRole(['TEACHER','ADMIN'])` | Auto-enrolls all STUDENT users |
| PUT | `/api/subjects/:id` | `requireRole(['TEACHER','ADMIN'])` | + owner check |
| DELETE | `/api/subjects/:id` | `requireRole(['TEACHER','ADMIN'])` | + owner check |
| GET | `/api/kcs?subjectId=` | `authenticate` | `apps/api/src/routes/kcs.ts` |
| POST | `/api/kcs` | `requireRole(['TEACHER','ADMIN'])` | Seeds `StudentMastery` rows for enrolled students with KC defaults |
| PUT | `/api/kcs/:id` | `requireRole(['TEACHER','ADMIN'])` | No owner check (subject not loaded) |
| DELETE | `/api/kcs/:id` | `requireRole(['TEACHER','ADMIN'])` | No owner check |
| GET | `/api/questions?subjectId=&kcId=` | `authenticate` | Returns `optionsJson` parsed; `apps/api/src/routes/questions.ts` |
| POST | `/api/questions` | `requireRole(['TEACHER','ADMIN'])` | options stored as JSON string |
| PUT | `/api/questions/:id` | `requireRole(['TEACHER','ADMIN'])` | + owner check via `subject.teacherId` |
| DELETE | `/api/questions/:id` | `requireRole(['TEACHER','ADMIN'])` | + owner check; deletes `Attempt` rows first (FK) |
| POST | `/api/questions/bulk` | `requireRole(['TEACHER','ADMIN'])` | + owner check; `prisma.$transaction` batch create |
| POST | `/api/ai/generate-questions` | `requireRole(['TEACHER','ADMIN'])` | Rate limit 10/min; returns drafts with `isApproved: false`; `apps/api/src/routes/ai.ts` |
| POST | `/api/ai/transform-question` | `requireRole(['TEACHER','ADMIN'])` | Rate limit 10/min; `action: 'variant' \| 'explanation'` |
| GET | `/api/teacher/analytics?subjectId=` | `requireRole(['TEACHER','ADMIN'])` | Difficulty stats, KC coverage, AI/manual counts; `apps/api/src/routes/teacher.ts` |
| GET | `/api/teacher/export-csv?subjectId=` | `requireRole(['TEACHER','ADMIN'])` | Streams CSV; `subjectId` required (400 otherwise) |
| GET | `/api/admin/export-db` | `requireRole(['ADMIN'])` | Streams SQLite `dev.db` file; logs action; `apps/api/src/routes/admin.ts` |

Note: no STUDENT-facing endpoints exist yet. `packages/shared-types/src/index.ts` already defines `SubmitAnswerPayload`, `SubmitAnswerResponse`, `StudentMasteryDto`, `FlaggedStudentDto` — the attempt/submit and mastery endpoints are planned but not implemented.

## Key Abstractions

**`IAiTutorService` (AI service interface):**
- Purpose: contract for AI tutoring features so implementations can be swapped/tested
- Location: `apps/api/src/ai/types.ts`
- Implementation: `GeminiAiTutorService` (`apps/api/src/ai/GeminiAiTutorService.ts`); singleton `aiTutorService` exported from `apps/api/src/ai/AiTutorService.ts`

**`authenticate` / `requireRole` (auth preHandlers):**
- Purpose: JWT verification and role-based access control per route
- Location: `apps/api/src/plugins/auth.ts`
- Pattern: Fastify `preHandler` hooks; `requireRole` composes `authenticate` then checks `request.user.role`

**`BKTParameters` + `calculatePosterior`/`updateMastery` (BKT math):**
- Purpose: Bayesian Knowledge Tracing posterior/transition updates
- Location: `packages/bkt-engine/src/bkt.ts`
- Pattern: pure functions, validated probabilities, clamped output `[0.0001, 0.9999]`

**`QuestionSelectionStrategy` / `AdaptivePolicy` (question selection):**
- Purpose: picks next question using productive-struggle band (0.4–0.7), spaced repetition (15% roll), anti-repetition
- Location: `packages/bkt-engine/src/policy.ts`
- Pattern: strategy interface with pluggable implementations (`AdaptivePolicy`, `RandomPolicy`)

**`apiFetch` (web API client):**
- Purpose: single fetch wrapper with Bearer injection and 401 auto-refresh + retry
- Location: `apps/web/src/lib/api.ts`

## Entry Points

**API server:**
- Location: `apps/api/src/index.ts`
- Triggers: `pnpm dev` (tsx watch), `pnpm start` (node dist)
- Responsibilities: dotenv load, `buildApp()`, listen on `PORT` (default 3001) / `HOST` (default 0.0.0.0)

**App factory:**
- Location: `apps/api/src/app.ts`
- Responsibilities: Fastify instance, helmet CSP (prod), CORS whitelist (`ALLOWED_ORIGINS` or localhost defaults), global rate limit (120/min), route plugin registration, `/health`, secure error handler

**Web app:**
- Location: `apps/web/src/main.tsx` (render) → `apps/web/src/App.tsx` (providers + router)
- Triggers: browser load
- Responsibilities: QueryClient setup, BrowserRouter, `checkAuth()` on mount, route table

## Error Handling

**Strategy:** Global Fastify error handler in `apps/api/src/app.ts` — returns `{ error: string }`; internal messages/stack only when `NODE_ENV=development`; generic pt-BR message for 5xx in prod.

**Patterns:**
- Route-level validation failures → `400` with `{ error, details }` (zod `flatten().fieldErrors`)
- Duplicate email → `409` (`apps/api/src/routes/auth.ts`)
- Auth failures → `401` ("Token de autenticação não fornecido" / "Sessão expirada ou token inválido")
- Role/ownership failures → `403` (ownership checks inline in `subjects.ts`, `questions.ts`)
- Not found → `404`
- AI failures → `500` with `err.message`; AI helper methods use internal static pt-BR fallbacks instead of throwing (except `generateQuestionsFromContent` and transform methods, which throw)
- Rate limiting → `429` via `@fastify/rate-limit` with pt-BR message (`apps/api/src/app.ts`)

## Cross-Cutting Concerns

**Logging:** Fastify pino logger (`level: LOG_LEVEL || 'info'`, disabled in test env) — `apps/api/src/app.ts`; explicit structured log in `admin.ts` export-db action; `console.warn/error` in AI layer.
**Validation:** zod schemas per route at the boundary; shared zod-based types for AI payloads in `apps/api/src/ai/types.ts`; XSS sanitization via `sanitizeString` transform (`apps/api/src/lib/sanitize.ts`) applied to name/description/statement/explanation fields.
**Authentication:** JWT access (1h) + refresh (7d), separate secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) with dev fallbacks and hard failure in production when missing — `apps/api/src/plugins/auth.ts`.
**Security headers:** `@fastify/helmet` (CSP enabled only in production) — `apps/api/src/app.ts`.
**Rate limiting:** global 120/min per IP + per-route 10/min on login and AI endpoints + in-process AI sliding window 12/min (`apps/api/src/ai/RateLimiter.ts`).

---

*Architecture analysis: 2026-08-01*
