# SECURITY REMEDIATION PHASE PLAN

**Project:** Escola (Plataforma de Tutoria Adaptativa)
**Source:** AUDIT_REPORT.md (2026-08-01) — OWASP Top 10:2025
**GSD phase type:** brownfield hardening / secure-phase
**Goal:** Remediate all actionable findings (SEC-01..SEC-40); document items that require human action (credential rotation, external monitoring).

## Phase Goal (goal-backward)

After this phase: a new developer cannot self-register as TEACHER; every teacher-owned resource (subjects, KCs, questions, analytics, exports) is ownership-checked; students only ever see approved questions without answer keys; refresh tokens are revocable/rotating and delivered via HttpOnly cookies; rate limiting works behind the Render proxy; dependencies are patched; CI + isolated tests verify the whole set. All verified by `pnpm typecheck`, `pnpm test`, `pnpm audit`, and a web production build.

## Out of scope (needs human action, documented in AUDIT_REPORT.md)

- Rotating the **Neon Postgres password** and **Gemini API key** at the provider (cannot be done from the repo).
- External alerting (Sentry/UptimeRobot).
- Full student practice flow (SEC-24) — resolved here by **descoping** (remove dead DTOs + unused bkt-engine dependency), not by building the feature.

## Tasks (atomic commits, ordered)

1. **A03 Supply chain** — `pnpm-workspace.yaml` `overridePackageVersions` → `overrides`; `vitest@^3.2.6` (api + bkt-engine); add `sanitize-html` (+types); try `react-router-dom@^8.3.0` (verify build, else revert with note); `brace-expansion` override; `engines` + `.nvmrc`.
2. **A02/A04 Prisma + secrets** — `schema.prisma` provider → `sqlite` (matches `migration_lock.toml`); add `RefreshToken` model; fix admin export path (prisma dir, not cwd); boot-time JWT secret policy (length ≥ 32, no known defaults); regenerate local `.env` JWT secrets; update `.env.example`.
3. **A04/A07 Auth core** — pin `algorithms: ['HS256']`; opaque rotating refresh tokens (random 64-hex) stored as SHA-256 in `RefreshToken` table; refresh endpoint rotates (revoke old) and sets HttpOnly cookie (`@fastify/cookie`); logout revokes + clears cookie; per-account login rate limit (email+IP key); password policy (min 8, letter+digit).
4. **A01 Routes** — `register` → STUDENT-only (no role field); `GET /questions` role-split (student: approved-only, enrolled subjects, no `correctAnswer`/`explanation`); ownership checks on `PUT/DELETE /kcs/:id` (+404), `POST /kcs`, `POST /questions` (+kcId-subject consistency), `teacher/analytics`, `teacher/export-csv`; `POST /questions/:id/approve` (owner-only); `isApproved = !isAiGenerated` server-side; `$transaction` question delete.
5. **A02/A06/A10 App + AI** — `setTrustProxy` (env-driven); helmet CSP always on; CORS: no-origin → no credentials reflection, disallowed origin → 403 (fix 500); error handler uses `request.log`; AI: `rawText` max 20k, generic error messages (no `err.message` leak), per-user rate limiter, AI output sanitized before return, prompt-injection delimiters.
6. **A05 Sanitization** — replace regex `sanitizeString` with `sanitize-html` (tags stripped, safe text); CSV formula injection escape (server + client export).
7. **A06/A08 Design/integrity** — remove auto-enrollment on register & subject create; students see only enrolled subjects; descope dead DTOs (`SubmitAnswer*`, `StudentMasteryDto`, `FlaggedStudentDto`) + `@escola/bkt-engine` dep; audit logging (register/login/refresh/logout/mutations/exports/approvals) via `request.log`; seed guarded against `NODE_ENV=production`.
8. **A02/A09 Ops** — `.gitignore` env variants; `vercel.json` exclude `/api/*` from SPA rewrite; `scripts/create-admin.ts` + `db:create-admin`; GitHub Actions CI (typecheck, lint, test, audit) + Dependabot; wire `lint` scripts + react eslint plugins.
9. **Web client** — `api.ts`: access token in memory, `credentials: 'include'`, refresh via cookie; store cleanup; `Login.tsx` (no TEACHER registration); `AiQuestionGeneratorModal` (isAiGenerated + approve flow + count ≤5); `TeacherSubjects` error UI + variant approve; `TeacherDashboard` download via apiFetch + error state; `BulkImportExportModal` formula escape.
10. **Tests** — `vitest.config.ts` + global setup (isolated `tests/test.db` via `prisma db push` + seed, sequential files); update `auth.test.ts` (STUDENT-only register, CORS 403, cookie refresh); new `tests/security.test.ts` (ownership matrix, answer-key split, approve, refresh rotation/revocation, logout revocation).
11. **Verify + report** — `pnpm typecheck`, `pnpm test`, `pnpm --filter @escola/web build`, `pnpm audit`, lint; update `AUDIT_REPORT.md` (status per SEC-ID) and `CODE_REVIEW_FINDINGS.md`; final commit.

## Verification gates

- All tests green on isolated DB.
- `tsc --noEmit` clean across all packages; web production build succeeds.
- `pnpm audit` clean or only accepted-risk entries (react-router if revert required).
- No `localStorage` token storage; no raw `err.message` in responses; no unowned-entity mutation reachable.
