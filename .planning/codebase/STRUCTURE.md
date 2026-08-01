# Codebase Structure

**Analysis Date:** 2026-08-01

## Directory Layout

```
escola/                          # pnpm workspace root ("escola-monorepo")
├── apps/
│   ├── api/                     # Fastify 5 TypeScript backend (port 3001)
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # 8 models (SQLite migration applied; schema header says postgresql)
│   │   │   ├── migrations/      # 20260721231624_init (SQLite provider per migration_lock.toml)
│   │   │   ├── seed.ts          # Demo teacher data (pt-BR)
│   │   │   └── dev.db           # SQLite dev database (committed)
│   │   ├── src/
│   │   │   ├── index.ts         # Server bootstrap (dotenv + listen)
│   │   │   ├── app.ts           # buildApp(): plugins, CORS, rate limit, route registration, error handler
│   │   │   ├── plugins/
│   │   │   │   └── auth.ts      # JWT access/refresh, authenticate, requireRole
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # /api/auth/*
│   │   │   │   ├── subjects.ts  # /api/subjects/*
│   │   │   │   ├── kcs.ts       # /api/kcs/*
│   │   │   │   ├── questions.ts # /api/questions/*
│   │   │   │   ├── ai.ts        # /api/ai/*
│   │   │   │   ├── teacher.ts   # /api/teacher/*
│   │   │   │   └── admin.ts     # /api/admin/*
│   │   │   ├── ai/
│   │   │   │   ├── types.ts             # zod schemas + IAiTutorService interface
│   │   │   │   ├── GeminiAiTutorService.ts  # GoogleGenerativeAI implementation
│   │   │   │   ├── AiCacheService.ts    # sha256 key + ai_caches table, 72h TTL
│   │   │   │   ├── RateLimiter.ts       # sliding-window limiter (12/min default)
│   │   │   │   └── AiTutorService.ts    # composition root: exports singleton aiTutorService
│   │   │   └── lib/
│   │   │       ├── prisma.ts    # PrismaClient singleton
│   │   │       └── sanitize.ts  # XSS sanitization zod transforms
│   │   └── tests/
│   │       ├── auth.test.ts     # vitest + supertest integration tests
│   │       └── ai.test.ts
│   └── web/                     # React 18 + Vite 6 + Tailwind 3 (port 3000)
│       ├── vite.config.ts       # dev proxy /api → http://localhost:3001, manualChunks
│       ├── tailwind.config.js / postcss.config.js
│       ├── vercel.json
│       └── src/
│           ├── main.tsx         # ReactDOM root, katex css
│           ├── App.tsx          # QueryClientProvider + BrowserRouter + Routes
│           ├── index.css
│           ├── store/
│           │   └── useAuthStore.ts    # Zustand auth state + localStorage tokens
│           ├── lib/
│           │   ├── api.ts       # apiFetch wrapper + 401 refresh interceptor
│           │   └── formatters.ts
│           ├── components/
│           │   ├── ProtectedRoute.tsx        # role-based route guard
│           │   ├── ErrorBoundary.tsx
│           │   ├── AiQuestionGeneratorModal.tsx
│           │   ├── BulkImportExportModal.tsx
│           │   ├── ExamPdfModal.tsx          # @react-pdf/renderer
│           │   ├── InstitutionSettingsModal.tsx
│           │   └── ui/                       # Button, Card, Input, Badge, Navbar, ProgressBar, ThemeToggle, FormattedText (KaTeX)
│           └── pages/
│               ├── Login.tsx
│               ├── TeacherDashboard.tsx
│               └── TeacherSubjects.tsx
├── packages/
│   ├── bkt-engine/              # @escola/bkt-engine — pure TS, builds to dist/ (tsc)
│   │   ├── src/
│   │   │   ├── index.ts         # barrel: exports bkt + policy
│   │   │   ├── bkt.ts           # BKTParameters, calculatePosterior, updateMastery
│   │   │   └── policy.ts        # AdaptivePolicy, RandomPolicy, QuestionSelectionStrategy
│   │   └── tests/               # bkt.test.ts, policy.test.ts (vitest)
│   └── shared-types/            # @escola/shared-types — DTOs, builds to dist/ (tsc)
│       └── src/index.ts         # UserDto, SubjectDto, QuestionDto, AuthTokens, SubmitAnswer*, etc.
├── package.json                 # workspace scripts (dev/build/test/lint, recursive)
├── pnpm-workspace.yaml          # packages: apps/*, packages/*; overrides esbuild/vite
├── tsconfig.json                # root TS config
├── eslint.config.js             # flat config (ESLint 10)
├── .prettierrc / .prettierignore
└── vercel.json
```

## Directory Purposes

**`apps/api/src/routes/`:**
- Purpose: one Fastify plugin per REST resource; each exports an async `xxxRoutes(fastify)` function
- Key files: all 7 files; registered in `apps/api/src/app.ts` with prefixes (`/api/auth`, `/api/subjects`, `/api/kcs`, `/api/questions`, `/api/ai`, `/api/teacher`, `/api/admin`)
- Pattern: zod schema at top of file → route handlers → Prisma calls → pt-BR error messages

**`apps/api/src/ai/`:**
- Purpose: Gemini integration layer, isolated from routes; swap-able behind `IAiTutorService`
- Key files: `types.ts`, `GeminiAiTutorService.ts`, `AiCacheService.ts`, `RateLimiter.ts`, `AiTutorService.ts`

**`apps/api/src/plugins/`:**
- Purpose: Fastify-level cross-cutting concerns (currently only auth)
- Key files: `auth.ts` — `authenticate`, `requireRole`, `generateTokens`, `verifyRefreshToken`, `UserPayload` type

**`apps/api/src/lib/`:**
- Purpose: shared infrastructure singletons/utilities
- Key files: `prisma.ts` (PrismaClient), `sanitize.ts` (XSS-safe zod transforms)

**`apps/web/src/components/ui/`:**
- Purpose: presentational primitives (no business logic); consumed by pages and modals
- Key files: `Button.tsx`, `Card.tsx`, `Input.tsx`, `Badge.tsx`, `Navbar.tsx`, `ProgressBar.tsx`, `ThemeToggle.tsx`, `FormattedText.tsx` (renders LaTeX via KaTeX)

**`apps/web/src/components/`:**
- Purpose: feature modals with business logic + API calls
- Key files: `AiQuestionGeneratorModal.tsx`, `BulkImportExportModal.tsx`, `ExamPdfModal.tsx`, `InstitutionSettingsModal.tsx`

**`packages/bkt-engine/src/`:**
- Purpose: framework-free BKT math + selection policies; the only dependency-free package
- Key files: `bkt.ts`, `policy.ts`, `index.ts`

**`packages/shared-types/src/`:**
- Purpose: canonical DTOs shared between web and API; consumed by web in source; API declares it but does not import it yet

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: API bootstrap (listen on PORT/HOST)
- `apps/api/src/app.ts`: Fastify composition root — register every new route here
- `apps/web/src/main.tsx`: React root
- `apps/web/src/App.tsx`: router + providers — declare every new page route here

**Configuration:**
- `pnpm-workspace.yaml`: workspace membership + pnpm overrides (esbuild ^0.25, vite ^6.4.3)
- `apps/api/package.json`: API scripts (dev/build/start/test/db:*), Prisma seed config
- `apps/web/vite.config.ts`: dev proxy + manualChunks split
- `apps/web/vercel.json`, root `vercel.json`: hosting config
- `.env.example` + `apps/web/.env.example`: env var names (PORT, HOST, NODE_ENV, DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, GEMINI_API_KEY, VITE_API_URL, ALLOWED_ORIGINS, LOG_LEVEL, GEMINI_MODEL)

**Core Logic:**
- `apps/api/src/routes/*.ts`: all REST handlers
- `apps/api/src/plugins/auth.ts`: JWT + roles
- `apps/api/src/ai/GeminiAiTutorService.ts`: Gemini prompts, model fallback, JSON repair
- `packages/bkt-engine/src/bkt.ts`: BKT update math
- `packages/bkt-engine/src/policy.ts`: adaptive question selection

**Testing:**
- `apps/api/tests/`: `auth.test.ts`, `ai.test.ts` (vitest + supertest, buildApp-based)
- `packages/bkt-engine/tests/`: `bkt.test.ts`, `policy.test.ts`

## Frontend Routes

Defined in `apps/web/src/App.tsx` (react-router-dom v7, `BrowserRouter`):

| Path | Component | Guard |
|---|---|---|
| `/login` | `apps/web/src/pages/Login.tsx` | Public |
| `/teacher/subjects` | `apps/web/src/pages/TeacherSubjects.tsx` | `ProtectedRoute` roles `TEACHER, ADMIN` |
| `/teacher/dashboard` | `apps/web/src/pages/TeacherDashboard.tsx` | `ProtectedRoute` roles `TEACHER, ADMIN` |
| `*` (fallback) | `<Navigate to="/teacher/subjects" replace />` | — |

Guard implementation: `apps/web/src/components/ProtectedRoute.tsx` — shows spinner while `isLoading`, redirects to `/login` when unauthenticated, redirects to `/teacher/subjects` on role mismatch, otherwise renders `<Outlet />`.

## Naming Conventions

**Files:**
- API route plugins: lowercase resource name (`subjects.ts`, `kcs.ts`) → exported `subjectRoutes`/`kcRoutes` (camelCase + `Routes` suffix)
- AI layer: PascalCase class files matching the class (`GeminiAiTutorService.ts`, `AiCacheService.ts`, `RateLimiter.ts`); `types.ts` for zod schemas + interfaces
- Web components: PascalCase (`TeacherDashboard.tsx`, `AiQuestionGeneratorModal.tsx`); UI primitives in `components/ui/`
- Web lib/store: camelCase (`api.ts`, `useAuthStore.ts`)

**Functions:**
- camelCase (`generateTokens`, `verifyRefreshToken`, `apiFetch`, `updateMastery`)

**Variables:**
- camelCase; prisma results often typed as `any` in map callbacks (e.g., `subjects.map((sub: any) => ...)`)
- zod parse results destructured as `parseResult.data`

**Types:**
- Interfaces: PascalCase (`IAiTutorService`, `UserPayload`, `BKTParameters`, `SubmitAnswerPayload`); zod schema consts PascalCase with `Schema` suffix (`RegisterSchema`, `DraftQuestionSchema`)

## Where to Add New Code

**New API endpoint for an existing resource:** add a handler inside the matching file in `apps/api/src/routes/`; no re-registration needed (plugin already mounted). If adding a new resource: create `apps/api/src/routes/<name>.ts` exporting `<name>Routes(fastify)`, then register in `apps/api/src/app.ts` with `app.register(<name>Routes, { prefix: '/api/<name>' })`.

**New AI capability:** add method to `IAiTutorService` in `apps/api/src/ai/types.ts` + zod response schema, implement in `GeminiAiTutorService.ts`, expose via the `aiTutorService` singleton (`apps/api/src/ai/AiTutorService.ts`), and add a route in `apps/api/src/routes/ai.ts` guarded by `requireRole(['TEACHER','ADMIN'])` with a `rateLimit` config.

**New page:** create `apps/web/src/pages/<Name>.tsx`, import it in `apps/web/src/App.tsx`, wrap in `<Route element={<ProtectedRoute allowedRoles={[...]} />}>` if guarded.

**New shared DTO:** add to `packages/shared-types/src/index.ts`, rebuild with `pnpm --filter @escola/shared-types build` (workspace packages resolve to `dist/` via `main`/`types` in their package.json).

**New BKT math/policy:** add to `packages/bkt-engine/src/` and re-export from `packages/bkt-engine/src/index.ts`.

**Tests:** API integration tests in `apps/api/tests/` (buildApp + supertest); pure unit tests in `packages/bkt-engine/tests/`.

## Special Directories

**`packages/bkt-engine/dist/`, `packages/shared-types/dist/`:**
- Purpose: compiled output (tsc) — workspace packages point `main`/`types` at dist; rebuild after changing `src/`
- Generated: Yes
- Committed: Yes (committed to git so `pnpm install` works without a build step)

**`apps/api/prisma/migrations/`:**
- Purpose: versioned schema migrations
- Generated: Yes (by `prisma migrate dev`)
- Committed: Yes

**`apps/api/prisma/dev.db`:**
- Purpose: SQLite development database (also seeded)
- Generated: Yes
- Committed: Yes (per repo state)

**`node_modules/`:**
- Purpose: pnpm store links
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-08-01*
