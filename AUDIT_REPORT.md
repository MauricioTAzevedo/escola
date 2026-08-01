# AUDIT_REPORT — Escola (Plataforma de Tutoria Adaptativa)

**Date:** 2026-08-01
**Audit type:** Full-stack functionality review + OWASP Top 10:2025 security audit
**Framework used:** GSD v1.42.3 (brownfield analysis — artifacts in `.planning/codebase/`)
**Standards:** OWASP Top 10:2025, OWASP API Security Top 10:2023, CWE
**Prior audit cross-referenced:** `CODE_REVIEW_FINDINGS.md` (2026-07-31)

---

## 1. Executive Summary

The project is a well-structured pnpm monorepo (Fastify + Prisma API, React 18 SPA, pure-TS BKT engine) whose
core differentiator — *adaptive tutoring* — is not yet wired into any live endpoint: as shipped, it is a
teacher-facing question-bank manager with Gemini AI generation. Code discipline is above average (strict TS,
Zod validation, centralized error handler, rate limiting, good AI-resilience design), and several findings from
the previous audit (2026-07-31) were already fixed (question ownership on PUT/DELETE, admin-only DB export,
registration can no longer grant ADMIN). However, the most important access-control problem remains: **anyone
can publicly register as a TEACHER**, which makes several medium-severity IDOR/BOLA bugs directly exploitable.
Live production secrets (Neon Postgres, Gemini key, weak JWT secrets) sit in cleartext `.env` files on disk.
Rate limiting is broken behind the Render proxy (no `trustProxy`), and the dependency tree has 7 known
vulnerabilities (1 critical). The verification layer (CI, lint wiring, test isolation) is absent. Recommended
next step: rotate secrets, harden registration/authorization, fix proxy/rate-limit, then add CI.

---

## 2. Site Overview

**Concept:** "Plataforma de Tutoria Adaptativa" — a Brazilian Portuguese (pt-BR) full-stack Intelligent
Tutoring System for teachers and students. Teachers create subjects, knowledge components (KCs) and multiple
choice questions, generate question drafts with Google Gemini, bulk import/export CSV/JSON, download exams as
PDF, and view analytics. The stated pedagogical core is a Bayesian Knowledge Tracing (BKT) engine with an
adaptive selection policy (productive-struggle band 40–70% mastery, spaced repetition, anti-repetition).

**What actually exists today (verified in code):**

| Layer | Status |
|---|---|
| Auth (JWT access 1h + refresh 7d, bcrypt) | Working; logout is a no-op; public registration grants TEACHER |
| Subjects / KCs / Questions CRUD | Working, teacher-owned; ownership enforced on update/delete of subjects and questions, **not** on KCs, not on create |
| Gemini question generation / variant / explanation | Working; resilient (SHA-256 cache, 12 RPM limiter, 6-model fallback, static pt-BR fallback) |
| Bulk import (CSV/JSON) + exports (CSV/JSON/PDF) | Working client+server |
| Teacher analytics dashboard | Working (per-subject counts, difficulty stats, KC coverage) |
| BKT engine + adaptive policy (`packages/bkt-engine`) | **Built and tested, but never imported by the API** — the student practice loop (submit answer → update mastery → select next question) does not exist |
| Student UI | None — `App.tsx` redirects everyone to `/teacher/subjects`; student DTOs exist as dead code |

**Target audience:** Brazilian teachers (primary, working) and students (planned/implied, not shipped).
**Main user flows:** register/login → create subject → create KCs → add questions (manual, bulk, or AI) →
review/approve AI drafts → view analytics → export bank or print PDF exam.

**Deployment:** Vercel (SPA, strict CSP headers) + Render free tier (Fastify API) + SQLite file DB (schema
declares Postgres — see A02) + Gemini free tier.

---

## 3. Functionality Review & Improvement Recommendations

### 3.1 Feature-by-feature assessment

| # | Feature | Assessment | Verdict |
|---|---|---|---|
| F1 | Auth (register/login/refresh/me) | Solid JWT flow, bcrypt cost 10, role checks. Logout no-op; no revocation; no lockout; public TEACHER registration | ⚠️ Needs work (security) |
| F2 | Subject CRUD | Clean ownership checks; but auto-enrolls **all** students into every new subject | ⚠️ Design flaw |
| F3 | KC CRUD | Missing 404s (Prisma P2025 → 500), missing ownership on PUT/DELETE | ⚠️ Needs work (security) |
| F4 | Question CRUD + bulk | Ownership fixed on PUT/DELETE; missing on POST; GET leaks `correctAnswer` to any authenticated user; no pagination | ⚠️ Needs work |
| F5 | AI generation (Gemini) | Excellent resilience (cache/fallback/rate-limit); count cap mismatch UI (10) vs API (5) → 400 for 6+; drafts not length-capped; raw error leak | ⚠️ Good core, fix edges |
| F6 | AI variant/explanation | Works; same error-leakage issue | ✅ / ⚠️ |
| F7 | Bulk import/export | Works; server CSV export has no ownership check; CSV formula injection | ⚠️ Needs work |
| F8 | Analytics dashboard | Works; `subjectId` not scoped to teacher (cross-teacher metadata leak) | ⚠️ Needs work |
| F9 | PDF exam (react-pdf + institution branding) | Works; institution settings stored in browser `localStorage` (per-device, not per-account) | ✅ / note |
| F10 | BKT engine | Correct math, well tested (11 tests), clean API — **not connected to any endpoint** | ⛔ Unwired |

### 3.2 Prioritized improvement suggestions

**P1 — Security-correctness (do first, see §5):**
1. Remove `TEACHER` from public registration (`routes/auth.ts:14`); registration is currently the single biggest hole (combined with the IDORs below it becomes a data-theft chain: register → export any teacher's bank).
2. Add ownership checks: `PUT/DELETE /api/kcs/:id`, `POST /api/questions`, `POST /api/kcs`, `GET /api/teacher/analytics?subjectId=`, `GET /api/teacher/export-csv?subjectId=`.
3. Split `GET /api/questions` by role: students get only `isApproved: true` questions **without** `correctAnswer`/`explanation`; teachers get full payload.
4. Set `trustProxy` and re-verify rate limits behind the Render proxy (see A02-1).

**P2 — Reliability/quality:**
5. Add 404 handling in `kcs.ts` PUT/DELETE (fetch first, like `questions.ts` does).
6. Wrap question delete in `prisma.$transaction` (attempts + question) — `questions.ts:183-187`.
7. Replace raw `err.message` returns in `ai.ts` with generic messages + `request.log.error` (consistent with the global sanitizing handler).
8. Cap `rawText` (e.g. 20 000 chars) and align the AI question count UI to the API's max of 5.
9. Use `request.log`/`fastify.log` instead of bare `console.error` (`app.ts:74`) for request-context-aware logging.
10. Add secondary indexes on all FK columns (`Question.subjectId/kcId`, `Attempt.studentId/questionId`, `StudentMastery.kcId`, `ClassEnrollment.subjectId`, `Subject.teacherId`) — free on small data, critical on Postgres.

**P3 — Maintainability/UX:**
11. Wire lint for real: add `lint` scripts per package, enable `eslint-plugin-react`/`react-hooks` (installed but unreferenced), add `prettier --check`; currently root `pnpm lint` runs nothing.
12. Extract the duplicated ownership check (6 occurrences) into one `assertOwnership` helper; delete the duplicated `formatDifficulty` (use `@escola/shared-types`); use the existing `sanitizedString()` helper.
13. Fix `pnpm-workspace.yaml` — `overridePackageVersions` is not a pnpm key (`overrides` is); the vite/esbuild pins are silently ignored.
14. Split `TeacherSubjects.tsx` (1 014 lines): 3 tabs + 3 modals + 6 mutations in one file.
15. Replace `alert()` error handling (`TeacherSubjects.tsx:258,284`), add `isError` UI for React Query lists (silent empty states today), add `.catch` to CSV download (`TeacherDashboard.tsx:62-77`), notify on refresh-token failure.
16. Route-level code splitting for dashboard (recharts chunk) — katex and recharts are loaded up front; verify against a Lighthouse budget.
17. Add per-package test DB isolation (see §6 action plan: tests currently hit `dev.db` and depend on seed state).
18. Remove dead code: `sanitizedString()` (unused), student DTOs (`SubmitAnswerPayload`, `StudentMasteryDto`, `FlaggedStudentDto`) either wire them in §4 or delete them; stale `admin/export-db` reading `dev.db`.

---

## 4. New Feature Proposals (impact vs. effort)

| # | Proposal | What it does | Why it fits | Complexity | Expected impact |
|---|---|---|---|---|---|
| N1 | **Student practice flow (the missing core)** | `POST /api/attempts` (submit answer → BKT posterior update), `GET /api/practice/next` (AdaptivePolicy selection), student dashboard with mastery bars. Schema (`Attempt`, `StudentMastery`, `ClassEnrollment`), DTOs and the BKT engine already exist | It is the product's stated purpose; without it the platform is a question-bank CRUD | **Medium** (API + one student page; engine is ready and tested) | **Very high** — unlocks the entire student audience and the adaptive differentiator |
| N2 | **Class management (replace auto-enroll)** | Teacher creates "turma", shares a 6-char code; students join opt-in; roster CSV import | Auto-enrolling every student into every subject is a privacy/UX anti-pattern (A06) | Medium | High — trust + correct-by-construction enrollment |
| N3 | **Teacher: bank search + server pagination** | Debounced server-side search, `?page=&limit=`, tag/filter by difficulty/type/approval | `GET /questions` returns everything today; degrades at 10k+ | Low | Medium |
| N4 | **Student: spaced-repetition review queue** | "Revise agora" list of mastered-but-decaying KCs using BKT params (policy already has spacing logic) | Fits the adaptive engine; drives retention | Low–Medium | Medium |
| N5 | **Teacher: AI batch-review mode** | Approve/edit multiple AI drafts at once, "duplicate detection" against existing bank | Improves the AI loop; saves teacher time | Low | Medium |
| N6 | **Teacher: share/collaborate** | Co-teacher invite per subject (ownership = creator, co-owner role) | Enables real schools with multiple teachers per discipline; also fixes the single-owner model that forces the IDORs | Medium | Medium |
| N7 | **Analytics: item-level calibration** | Show per-question pGuess/pSlip (from BKT) and discrimination index; flag questions students guess | Turns accumulated attempt data into pedagogy | Medium | Medium |
| N8 | **Account bootstrap: admin console** | First-run admin creation, user management (role changes, disable), server-side institution settings | Today NO admin account can exist (register forbids ADMIN; seed makes only TEACHER) — the admin route is dead code | Medium | High for ops/security |
| N9 | **SSO/Google sign-in for teachers** | OAuth2 with Google | Reduces password reuse & fake registrations; complements N1/N8 | Medium | Medium |
| N10 | **Export: exam with separate answer key** | PDF with/without gabarito; watermark per student | Directly useful for printed assessments | Low | Low–Medium |

---

## 5. Security Findings by OWASP Top 10:2025

> Scope notes: verified against source on disk. No exploit code was written. Findings marked "fixed" relative to the 2026-07-31 audit were re-verified.

### A01 — Broken Access Control (incl. SSRF)

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-01 | **High** | **Public self-registration as TEACHER (BFLA).** `RegisterSchema` allows `role: 'TEACHER'` (`auth.ts:14`) and the app's only registration UI sends it (`Login.tsx:31`). Any anonymous user gains full teacher capabilities (create subjects, use AI quota, view analytics, export any bank, delete any KC — see SEC-03/04). The prior SEC-02 fix only removed `ADMIN` from the enum; the problem remains. | `apps/api/src/routes/auth.ts:14`; `apps/web/src/pages/Login.tsx:31` |
| SEC-02 | **High** | **Answer-key leak on `GET /api/questions`.** Returns `correctAnswer`, `explanation`, and `isApproved:false` rows to **any authenticated user** (incl. students). The `isApproved` flag exists to keep drafts private, but the query never filters on it. Latent today (no student UI) — directly exploitable once N1 ships, or by any self-registered account. | `apps/api/src/routes/questions.ts:59-91` |
| SEC-03 | **High** | **BOLA on `PUT/DELETE /api/kcs/:id`.** No ownership/existence check at all → any teacher edits or deletes any KC (cascade-wiping questions via FK). | `apps/api/src/routes/kcs.ts:90-122` |
| SEC-04 | **High** | **IDOR on `GET /api/teacher/export-csv?subjectId=`.** No check that the subject belongs to the caller — any teacher downloads any teacher's full question bank **with answer keys**, and gets it as CSV (formula injection, SEC-12). | `apps/api/src/routes/teacher.ts:84-119` |
| SEC-05 | **Medium** | **IDOR on `GET /api/teacher/analytics?subjectId=`.** `subjectId` is honored verbatim (`teacher.ts:19`); KCs and question counts of another teacher's subject are disclosed. | `apps/api/src/routes/teacher.ts:11-19` |
| SEC-06 | **Medium** | **Missing ownership on create paths.** `POST /api/questions` and `POST /api/kcs` accept any `subjectId`/`kcId` — a teacher can plant content (incl. deliberately wrong answers) in another teacher's bank. PUT/DELETE on questions were fixed; create paths were not. | `apps/api/src/routes/questions.ts:94-109`; `apps/api/src/routes/kcs.ts:56-88` |
| — | No issues found | **SSRF:** all outbound HTTP goes through the official `@google/generative-ai` SDK to a fixed URL with the key from env only. No user-controllable URL fetch exists anywhere. | `apps/api/src/ai/GeminiAiTutorService.ts:151-196` |

### A02 — Security Misconfiguration

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-07 | **High** | **Rate limiting broken behind the Render proxy (no `trustProxy`).** `@fastify/rate-limit` (120/min global, 10/min login) keys on the proxy IP; every client shares it → one user's 10 failed logins locks out the whole app; per-IP protection is null. Fix: `app.setTrustProxy(1)` + verify `request.ip`, then re-test. | `apps/api/src/app.ts:49-57` (no `trustProxy` anywhere) |
| SEC-08 | **Critical** | **Live production secrets in cleartext on disk.** `.env` and `apps/api/.env` contain a live-looking Neon Postgres URL (owner role), a real Gemini API key, and JWT secrets. Not tracked by git (verified: only `.env.example` in history — no leak in git), but any machine compromise, backup copy or share exposes the DB and AI quota. JWT secrets are word-based passphrases (low entropy) with quote artifacts. **Action: rotate all three now**, generate random 32+ char secrets. | `.env`; `apps/api/.env` |
| SEC-09 | **Medium** | **Prisma provider mismatch.** `schema.prisma:2` declares `postgresql`; the applied migration is SQLite (`migration_lock.toml:4`) and `dev.db` is in use. Migrations/generate are broken for the deployed state; the admin export reads `dev.db` via `process.cwd()` (`admin.ts:16`) → 404 once Postgres is real. Decide one provider and converge. | `apps/api/prisma/schema.prisma:1-4`; `apps/api/src/routes/admin.ts:16` |
| SEC-10 | **Medium** | **CORS allows no-origin requests with `credentials: true`.** `!origin` short-circuits the whitelist; curl/non-browser agents get credentialed CORS. Prefer reflecting only the whitelist (or explicit false) for no-origin requests. | `apps/api/src/app.ts:34-46` |
| SEC-11 | **Low** | **CSP only enabled in production.** Helmet's CSP is skipped in dev/staging (`app.ts:20`); a staging deployment without `NODE_ENV=production` ships without CSP. | `apps/api/src/app.ts:19-22` |
| SEC-12 | **Low** | **`vercel.json` rewrites `/:path*` → index.html**, so `/api/*` returns a 200 HTML page if `VITE_API_URL` is misconfigured — silent failures (broken fetch, mysterious `Unexpected token <` errors). | `vercel.json:37-42` |
| SEC-13 | **Low** | `.gitignore` covers `.env`/`.env.local` only; `.env.production`/`.env.*` variants are unignored. Also **no admin bootstrap path** exists (register forbids ADMIN, seed creates only TEACHER) — the admin export endpoint is unreachable dead code. | `.gitignore:11-12`; `apps/api/src/routes/admin.ts` |

### A03 — Software Supply Chain Failures

`pnpm audit` (2026-08-01): **7 vulnerabilities — 1 critical, 3 high, 3 moderate.**

| ID | Severity | Package | Issue / Advisory | Impact scope |
|---|---|---|---|---|
| SEC-14 | **Critical** | `vitest` <3.2.6 (api, bkt-engine) | GHSA-5xrq-8626-4rwp — arbitrary file read/execute via Vitest UI server | Dev-only (test tooling), but critical-rated; fix: `vitest@^3.2.6` |
| SEC-15 | **High** | `vite` ≤6.4.2 (via vitest transitive) | GHSA-fx2h-pf6j-xcff — `server.fs.deny` bypass on Windows; also `launch-editor` NTLMv2 disclosure (GHSA-v6wh-96g9-6wx3) | Dev-only; the direct web `vite 6.4.3` is patched — the vulnerable copies ride in through vitest |
| SEC-16 | **High** | `react-router` ≥7.12 <8.3 (via react-router-dom 7.18.1) | GHSA-qwww-vcr4-c8h2 — RSC-mode CSRF bypass. Web app does not use RSC → low practical risk; upgrade to ≥8.3 or pin a patched 7.x when available | Runtime dep |
| SEC-17 | **High** | `brace-expansion` <1.1.17 (transitive) | GHSA-4w7w-66w2-5vf9 — regex DoS / OOM | Transitive (build tooling) |
| — | Medium | `vitest` <3.2.6 / `vite` ≤6.4.2 | Remaining moderate advisories (3 moderate total) | Dev-only |

Additional notes:
- **`pnpm-workspace.yaml:17-19` uses `overridePackageVersions`, which is not a pnpm key** — the `esbuild`/`vite` pins are silently ignored (`overrides` is the real key). The prior audit's "SEC-05 fixed" claim relies on this pin; it is not in effect.
- No CI, no Dependabot/secret scanning, no lockfile-age enforcement (A08/A09 overlap).
- Outdated majors: `vitest` 1.x, `prisma` 5.x, `@google/generative-ai` 0.11.x (superseded by `@google/genai`).
- No `engines`/`.nvmrc`; README says Node ≥18 but pnpm 11 requires Node ≥22.

### A04 — Cryptographic Failures

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-18 | **Low** | **`jwt.verify` without `algorithms` pinning** (no `{ algorithms: ['HS256'] }`). With only symmetric keys in use this is low-risk, but pinning is free and prevents algorithm-confusion regressions. | `apps/api/src/plugins/auth.ts:45,60` |
| SEC-19 | **Low** | **JWT secrets are low-entropy passphrases** (word-based, ~47 chars but predictable pattern) stored in `.env` (SEC-08). If leaked, tokens are forgeable — aggravated by no revocation (SEC-21). | `.env` |
| SEC-20 | **Low** | **Access + refresh tokens in `localStorage`** (survives the prior SEC-07 rating). Any XSS on the domain exfiltrates both. Preferred: refresh in HttpOnly/Secure/SameSite cookie, access in memory. | `apps/web/src/lib/api.ts:20,46`; `apps/web/src/store/useAuthStore.ts:20-21` |
| — | No issues found | Passwords hashed with bcryptjs (cost 10) — sound. No weak algorithms (MD5/SHA1) in use for security contexts; the SHA-256 AiCache key is a cache key, not a security control. | `apps/api/src/routes/auth.ts:47,116` |

### A05 — Injection (SQL, NoSQL, Command, Template, etc.)

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-21 | **Medium** | **Bypassable custom regex sanitizer** (`sanitizeString`). Regex-based stripping of script/iframe/on-event/protocols can be evaded (entity encoding, `onerror` variants, nested patterns). **Real-world impact is reduced** because the app's only HTML sink (`FormattedText.tsx:314`) renders **KaTeX output**, which HTML-escapes its input (KaTeX 0.18.1 is the patched release), and all other rendering is React text nodes. So this is defense-in-depth today — but it is the *only* boundary protecting any future sink. Replace with `sanitize-html`/`isomorphic-dompurify`. | `apps/api/src/lib/sanitize.ts:6-25` |
| SEC-22 | **Medium** | **Prompt injection / untrusted AI input.** `rawText` and question text are interpolated verbatim into Gemini prompts (`GeminiAiTutorService.ts:315,374,418`), and Gemini output (drafts, explanations) is returned to the client **unsanitized** (`routes/ai.ts:45-50`). Drafts are rendered with `FormattedText` (safe sink) and re-sanitized at create-time, so today the blast radius is self-XSS + AI-quota abuse; still add output validation/trimming and treat AI output as untrusted. | `apps/api/src/routes/ai.ts:45-50`; `apps/api/src/ai/GeminiAiTutorService.ts` |
| SEC-23 | **Low** | **CSV formula injection** in the server export — statement/explanation fields starting with `=`, `+`, `-`, `@` are executed by Excel/LibreOffice when the CSV is opened (payloads come from teacher-authored content; realistic vector is the IDOR in SEC-04). Prefix with `'` or strip leading formula chars. | `apps/api/src/routes/teacher.ts:103-110` |
| — | No issues found | **SQL/NoSQL injection:** 100% Prisma ORM, no raw SQL, no string-built queries. **Command injection:** no shell/exec usage. **Template injection:** no server-side templating of user input. | — |

### A06 — Insecure Design

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-24 | **High** | **The adaptive core is unwired.** `@escola/bkt-engine` is a declared API dependency but never imported — the BKT/adaptive loop is a design promise with no implementation (no attempt-submission endpoint, no selection endpoint, no student UI). Functionally, the site ships as a question-bank CRUD; the README's headline capability does not exist. Either implement (N1) or descope to avoid misrepresentation and dead DTOs. | `apps/api/package.json:18`; no imports in `apps/api/src`; dead DTOs in `packages/shared-types/src/index.ts:81-115` |
| SEC-25 | **Medium** | **Mass auto-enrollment on registration.** Every new student is enrolled in **every** subject (`auth.ts:59-66`) and every new subject enrolls **every** student (`subjects.ts:110-115`). No consent, no class concept — every student can eventually see every teacher's bank (compounds SEC-02). Replace with opt-in class codes (N2). | `apps/api/src/routes/auth.ts:59-66`; `apps/api/src/routes/subjects.ts:109-115` |
| SEC-26 | **Low** | **Shared AI budget with no per-user accounting.** The 12-RPM limiter (`RateLimiter.ts`) is a per-process, global (not per-user) token bucket; one teacher can starve the shared free-tier Gemini quota; multi-instance deployment resets it per instance. | `apps/api/src/ai/GeminiAiTutorService.ts:148` |
| SEC-27 | **Low** | `rawText` has a min of 20 chars but **no max** — a 10 MB paste is sent to Gemini per request (cost abuse within the 10/min route limit). | `apps/api/src/routes/ai.ts:6-11` |

### A07 — Authentication Failures

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-28 | **Medium** | **Refresh tokens are stateless with rotation but no revocation; logout is a no-op.** A stolen refresh token replays for up to 7 days; `/logout` (`auth.ts:173-175`) returns success without invalidating anything. Implement a deny-list (DB table keyed by `jti`) or switch to rotating + persisted refresh sessions. | `apps/api/src/routes/auth.ts:143-175` |
| SEC-29 | **Medium** | **No email verification, no lockout, no password reset.** Only the 10/min per-IP login limit (itself broken behind the proxy — SEC-07). Rate limiting on login is the entire anti-brute-force story. | `apps/api/src/routes/auth.ts:90-99` |
| SEC-30 | **Low** | Demo/seed accounts with `senha123` are documented in the README and present in any seeded environment; seed script wipes all tables on every run (`seed.ts:26-33`) — running it against prod data is destructive. | `README.md:119-128`; `apps/api/prisma/seed.ts` |
| — | No issues found | Dev-only fallback secrets (`plugins/auth.ts:29-32`) fail **closed** in production (boot error). Tokens carry `type` claims checked at verify (access vs refresh confusion prevented). | `apps/api/src/plugins/auth.ts:21-27,46,62` |

### A08 — Software & Data Integrity Failures

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-31 | **Medium** | **No pipeline/integrity controls.** No CI exists (README claims GitHub Actions; `.github/` does not exist). No secret scanning, no dependency diffing, no automated test gate — integrity of what ships is enforced only by local discipline. | repo root |
| SEC-32 | **Low** | AI draft approval is **client-side only**: the modal reviews drafts and immediately `POST /questions` with `isApproved: true` (`AiQuestionGeneratorModal.tsx:84-99`); there is no server-side review state machine or audit of who approved what. For a content-integrity feature (`isApproved`), the server should own approval transitions. | `apps/web/src/components/AiQuestionGeneratorModal.tsx:77-108` |
| — | No issues found | No insecure deserialization (JSON parsing is scoped to controlled data; bulk import parses client-side then re-validates via Zod server-side). No unsigned/verifiable artifact concerns beyond SEC-31. | — |

### A09 — Security Logging & Alerting Failures

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-33 | **Medium** | **No audit trail for security-relevant events.** Login failures, registration, refresh, and all CRUD mutations are unlogged. The only logged security action is the admin DB export. The global error handler uses bare `console.error` (`app.ts:74`) without request context — a real incident would be uninvestigable. | `apps/api/src/app.ts:74`; `apps/api/src/routes/admin.ts:12-14` |
| SEC-34 | **Low** | No alerting/error tracking anywhere (no Sentry, no health-alerting; `/health` exists but nothing consumes it). | repo root |
| SEC-35 | **Low** | AI failures are logged with emoji-prefixed `console.warn`/`console.error`, and one path (`generateStudyFeedback`, `GeminiAiTutorService.ts:292-294`) drops the error entirely. | `apps/api/src/ai/GeminiAiTutorService.ts:189-195,251-254,292-294` |

### A10 — Mishandling of Exceptional Conditions

| ID | Severity | Finding | Location |
|---|---|---|---|
| SEC-36 | **Medium** | **AI routes leak raw `err.message` to clients** (e.g. model names, quota text, "Chave de API do Gemini não configurada"), bypassing the sanitizing global handler. | `apps/api/src/routes/ai.ts:51-55,102-106` |
| SEC-37 | **Medium** | **`PUT/DELETE /api/kcs/:id` on missing IDs → 500** (Prisma `P2025` bubbles up) instead of 404; the global handler masks the message but the status is wrong. | `apps/api/src/routes/kcs.ts:96-121` |
| SEC-38 | **Low** | **Non-transactional cascade delete** of questions — attempt-delete then question-delete in two statements; a crash between them orphans attempts. | `apps/api/src/routes/questions.ts:183-187` |
| SEC-39 | **Low** | Frontend fail-open/silent states: query failures show empty lists with no `isError` UI; CSV download has no `.catch`; refresh-token failure clears tokens without notifying the user. | `apps/web/src/pages/TeacherDashboard.tsx:62-77`; `apps/web/src/pages/TeacherSubjects.tsx` |
| SEC-40 | **Low** | Disallowed CORS origin yields a **500** (error handler) rather than a 4xx — semantics wrong, and locked in by a test (`auth.test.ts:65-72`). | `apps/api/src/app.ts:41` |

---

## 6. Prioritized Action Plan (top 10)

Ranked by risk/impact vs. effort.

| # | Action | Category | Effort | Why |
|---|---|---|---|---|
| 1 | **Rotate all exposed credentials** — Neon Postgres password, Gemini API key, and both JWT secrets (→ random, 32+ chars, no quotes); move to Render env vars / secret manager | A02/A04 | 15 min | Live owner-level DB access + forgeable tokens (SEC-08) |
| 2 | **Registration: students only** (or invite-only for teachers). Remove `TEACHER` from the register role enum and from `Login.tsx` | A01 | Small | Disarms the whole IDOR/BOLA chain (SEC-01) |
| 3 | **Fix broken access control**: ownership checks on `kcs.ts` PUT/DELETE, `POST /questions`, `POST /kcs`, `teacher/analytics`, `teacher/export-csv`; role-split `GET /questions` (students: approved-only, no answers) | A01 | Medium | SEC-02/03/04/05/06 |
| 4 | **`trustProxy` + rate-limit re-verification** behind Render; add login per-IP + per-account limits, and per-user AI quota | A02/A06 | Small | SEC-07 — currently one user can lock the whole app and starve Gemini |
| 5 | **Update vulnerable dependencies**: `vitest ≥3.2.6`, direct `vite` (web) already patched — remove vitest's old vite; `react-router-dom` upgrade path when 8.x or patched 7.x; fix `pnpm-workspace.yaml` `overrides` key; enable Dependabot | A03 | Small–Medium | SEC-14..17 |
| 6 | **Resolve the Prisma provider mismatch** (commit to SQLite or migrate properly to Postgres; regenerate migrations; fix/remove the `dev.db` admin export; add FK indexes) | A02 | Medium | SEC-09 — migrations currently lie about the deployed schema |
| 7 | **CI + test isolation**: GitHub Actions (lint, typecheck, tests, `pnpm audit`), per-run SQLite test DB + fixtures, coverage thresholds, wire the dead ESLint config (scripts + react-hooks plugins) | A03/A08/A09 | Medium | Nothing verifies changes today; API tests depend on seed state |
| 8 | **Error-handling consistency**: 404s on KC update/delete, `$transaction` on question delete, generic AI error messages + `request.log`, drop raw `err.message` exposure, fix CORS-500 | A10 | Small | SEC-36..40 |
| 9 | **Implement or descope the student practice flow** (N1): one attempt endpoint + adaptive next-question endpoint + minimal student page, using the tested BKT engine; remove dead student DTOs if descoped | A06 | Medium–Large | SEC-24 — the product's core promise |
| 10 | **UX/debt pass**: align AI count cap (UI 10 → API 5), error states on queries, replace `alert()`, extract `assertOwnership`, split `TeacherSubjects.tsx`, pagination + server search on question lists | — | Medium | Directly user-visible quality + maintainability |

---

## Appendix A — Fixed since previous audit (verified)

- Registration can no longer assign `ADMIN` (was SEC-02 high) — `auth.ts:14` enum `STUDENT|TEACHER`.
- Question `PUT`/`DELETE` now enforce subject ownership (was SEC-03) — `questions.ts:132,177`.
- `GET /api/admin/export-db` now `ADMIN`-only (was SEC-04) — `admin.ts:10`.
- No secrets ever committed to git history (verified `git log -p` + `git ls-files`).
- CSP tightened on Vercel (no `unsafe-inline`/`unsafe-eval` in `script-src`), X-XSS-Protection and X-Permitted-Cross-Domain-Policies headers added (recent commits).

## Appendix B — Verification notes

- `pnpm audit` run 2026-08-01: 7 vulns (1 critical, 3 high, 3 moderate) — details in A03.
- Tests runnable locally: `pnpm test` covers API (9+4) and bkt-engine (11); web has no test script; zero coverage config.
- GSD brownfield artifacts produced during this audit: `.planning/codebase/{STACK,ARCHITECTURE,STRUCTURE,INTEGRATIONS,CONCERNS}.md`.
- All file:line references verified against the working tree at commit `5c4bc07`.
