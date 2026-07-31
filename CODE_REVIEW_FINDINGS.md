# Code Quality & Security Review Findings

**Project:** Escola (Plataforma de Tutoria Adaptativa)  
**Date:** July 31, 2026  
**Auditor:** Senior AppSec & Code Quality Reviewer  
**Standards:** OWASP Top 10:2025, OWASP API Security Top 10:2023  

---

## Executive Summary

A comprehensive secure-coding and code-quality review was conducted across all application layers of the repository, including front-end (`apps/web`), back-end (`apps/api`), database schemas (`prisma/schema.prisma`), authentication/authorization plugins, and dependency management.

| Severity | Count | Summary |
|---|:---:|---|
| **Critical** | **1** | Hardcoded production database credentials and API keys in environment config |
| **High** | **3** | Self-elevation of privilege on user registration, BOLA/IDOR on question endpoints, sensitive DB dump endpoint accessible to non-admin roles |
| **Medium** | **2** | Outdated dependencies with known vulnerabilities (esbuild/vite), bypassable custom XSS sanitization regex |
| **Low** | **2** | Storage of JWT tokens in `localStorage`, stateless logout without token revocation |
| **Informational** | **1** | Default fallback JWT secret in non-production environments |
| **Total** | **9** | |

---

## Summary Findings Table

| ID | Title | Severity | Location | Category / Reference |
|---|---|:---:|---|---|
| **SEC-01** | Real Credentials in Unprotected Local `.env` File | Critical | `apps/api/.env:3,6` | OWASP A02:2025 - Security Misconfiguration / CWE-522 |
| **SEC-02** | Unrestricted Self-Elevation of Privilege on Registration | High | `apps/api/src/routes/auth.ts:11,32` | OWASP API5:2023 - Broken Function Level Authorization / CWE-269 |
| **SEC-03** | Broken Object Level Authorization (IDOR) on Question Update/Delete | High | `apps/api/src/routes/questions.ts:106,139` | OWASP API1:2023 - Broken Object Level Authorization / CWE-639 |
| **SEC-04** | Overly Permissive Access to Full SQLite Database Dump Endpoint | High | `apps/api/src/routes/admin.ts:10` | OWASP API5:2023 - Broken Function Level Authorization / CWE-200 |
| **SEC-05** | Vulnerabilities in Direct and Transitive Project Dependencies | Medium | `apps/api/package.json`, `apps/web/package.json` | OWASP A03:2025 - Software Supply Chain Failures / CWE-1395 |
| **SEC-06** | Incomplete Custom XSS Regex Sanitizer | Medium | `apps/api/src/lib/sanitize.ts:6-15` | OWASP A05:2025 - Injection / CWE-79 |
| **SEC-07** | JWT Access & Refresh Tokens Stored in `localStorage` | Low | `apps/web/src/lib/api.ts:20,46` | OWASP A04:2025 - Cryptographic Failures / CWE-922 |
| **SEC-08** | Stateless Logout Endpoint Without Token Revocation | Low | `apps/api/src/routes/auth.ts:169` | OWASP API2:2023 - Broken Authentication / CWE-613 |
| **SEC-09** | Default Hardcoded JWT Secret Fallback | Informational | `apps/api/src/plugins/auth.ts:27-29` | OWASP A02:2025 - Security Misconfiguration / CWE-1188 |

---

## Manual Review Checklist by Layer

- **Front-end**:
  - ⚠️ XSS Sanitization: Custom regex parser used in `sanitize.ts` is bypassable.
  - ⚠️ Token Storage: Tokens stored in `localStorage`.
  - ✅ CSRF: Application uses Bearer tokens in headers, avoiding ambient browser cookie exposure.
  - ✅ Security Headers: `@fastify/helmet` enabled on API backend.
- **Back-end**:
  - ✅ Parameterized SQL Queries: 100% ORM abstraction via Prisma Client.
  - ⚠️ Broken Access Control (IDOR): Missing owner check on `PUT /api/questions/:id` and `DELETE /api/questions/:id`.
  - ⚠️ Privileged Route Authorization: `POST /api/auth/register` allows role self-selection (`ADMIN`/`TEACHER`).
  - ✅ Rate Limiting: `@fastify/rate-limit` registered globally and custom rate limiter applied on Gemini AI services.
- **Authentication & Session**:
  - ✅ Password Hashing: `bcryptjs` with salt round factor 10.
  - ✅ JWT Structure: Expiration set to 1 hour (access) and 7 days (refresh), with typed payload checks.
  - ⚠️ Token Revocation: No token blacklisting or revocation mechanism on logout.
- **Database**:
  - ✅ Query Safety: No dynamic raw SQL string interpolation found.
  - ⚠️ Credential Exposure: Live database credentials present in local `.env` files.
- **APIs**:
  - ⚠️ BOLA/BFLA: BFLA bypass in registration and database dump endpoints; BOLA issue in question management.
  - ✅ Input Validation: Zod schemas enforcing types across API endpoints.
  - ✅ CORS: Controlled origin whitelist configured in `app.ts`.
- **Infrastructure**:
  - ✅ `.gitignore`: Correctly ignores `.env`, `node_modules`, and build artifacts.
  - ⚠️ Dependency Audit: 7 vulnerabilities detected via `pnpm audit`.

---

## Detailed Findings

### SEC-01 — Real Credentials in Unprotected Local `.env` File
- **Severity:** Critical
- **Location:** [apps/api/.env:3,6](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/.env#L3-L6)
- **Description:** Real production/cloud credentials for Neon PostgreSQL (`postgresql://neondb_owner:***@ep-little-pond...`) and Google Gemini API keys are stored in cleartext in the local `apps/api/.env` file. While `.env` is listed in `.gitignore`, committing or sharing this folder exposes live database credentials.
- **Impact Scenario:** An attacker obtaining access to this file can connect directly to the Neon PostgreSQL cluster with owner-level rights, dumping, modifying, or deleting all application data.
- **CWE / OWASP:** CWE-522 (Insufficient Credentials Protection) / OWASP A02:2025 Security Misconfiguration.
- **Suggested Fix:** Rotate the exposed Neon database password and Gemini API keys immediately. Ensure local developers use `.env.example` templates and keep actual credentials in secure secret management systems (e.g. Render environment variables).

---

### SEC-02 — Unrestricted Self-Elevation of Privilege on Registration
- **Severity:** High
- **Location:** [apps/api/src/routes/auth.ts:11,32](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/routes/auth.ts#L11-L32)
- **Description:** The `RegisterSchema` Zod validator allows the `role` field to be supplied directly by the client (`z.enum(['STUDENT', 'TEACHER', 'ADMIN'])`). The registration endpoint automatically assigns whatever role is submitted in `request.body`.
- **Impact Scenario:** An unauthenticated public user submitting a POST request to `/api/auth/register` with `{"name": "Attacker", "email": "att@example.com", "password": "password123", "role": "ADMIN"}` will be granted full `ADMIN` rights instantly.
- **CWE / OWASP:** CWE-269 (Improper Privilege Management) / OWASP API Security Top 10:2023 API5 (Broken Function Level Authorization).
- **Suggested Fix:** Hardcode `role: 'STUDENT'` in public registration routes, or require an existing administrator token to grant `TEACHER` or `ADMIN` roles.

---

### SEC-03 — Broken Object Level Authorization (IDOR) on Question Update/Delete
- **Severity:** High
- **Location:** [apps/api/src/routes/questions.ts:106,139](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/routes/questions.ts#L106-L139)
- **Description:** In `PUT /api/questions/:id` and `DELETE /api/questions/:id`, the route verifies that the requester has a `TEACHER` or `ADMIN` role via `requireRole(['TEACHER', 'ADMIN'])`, but fails to check whether the target question belongs to a subject owned by that specific teacher.
- **Impact Scenario:** Teacher A can send a `DELETE /api/questions/<question-id-of-teacher-B>` request and successfully delete questions created by Teacher B.
- **CWE / OWASP:** CWE-639 (Insecure Direct Object Reference) / OWASP API Security Top 10:2023 API1 (Broken Object Level Authorization).
- **Suggested Fix:** Verify subject ownership prior to modification:
  ```typescript
  const question = await prisma.question.findUnique({
    where: { id },
    include: { subject: true }
  });
  if (request.user.role !== 'ADMIN' && question?.subject.teacherId !== request.user.userId) {
    return reply.status(403).send({ error: 'Acesso negado' });
  }
  ```

---

### SEC-04 — Overly Permissive Access to Full SQLite Database Dump Endpoint
- **Severity:** High
- **Location:** [apps/api/src/routes/admin.ts:10](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/routes/admin.ts#L10)
- **Description:** The endpoint `GET /api/admin/export-db` permits any user with the `TEACHER` role to download the entire SQLite `dev.db` file.
- **Impact Scenario:** Any registered teacher account can download the full database, extracting user emails, password hashes, and system logs.
- **CWE / OWASP:** CWE-200 (Exposure of Sensitive Information) / OWASP API Security Top 10:2023 API5 (Broken Function Level Authorization).
- **Suggested Fix:** Restrict `GET /api/admin/export-db` to `requireRole(['ADMIN'])` only.

---

### SEC-05 — Vulnerabilities in Direct and Transitive Project Dependencies
- **Severity:** Medium
- **Location:** `apps/api/package.json`, `apps/web/package.json`
- **Description:** `pnpm audit` reported 7 vulnerabilities (1 Critical, 3 High, 3 Moderate), including `esbuild` (<=0.24.2) and `vite` (<=6.4.2).
- **Impact Scenario:** Outdated development dependencies can expose build tools or local servers to path traversal or remote code execution risks during development/build pipelines.
- **CWE / OWASP:** CWE-1395 / OWASP A03:2025 Software Supply Chain Failures.
- **Suggested Fix:** Execute `pnpm update esbuild vite --recursive` or run `pnpm audit --fix` to update vulnerable packages.

---

### SEC-06 — Incomplete Custom XSS Regex Sanitizer
- **Severity:** Medium
- **Location:** [apps/api/src/lib/sanitize.ts:6-15](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/lib/sanitize.ts#L6-L15)
- **Description:** The `sanitizeString` function attempts to strip script/iframe tags and event handlers using regular expressions. Custom regex sanitizers are notoriously incomplete and can be bypassed using nested tags (e.g. `<scr<script>ipt>`), alternate event handlers (`ontouchend`, `onfocus`), or SVG/MathML payloads (`<svg onload=...>`).
- **Impact Scenario:** An attacker submits a question statement with `<img src=x onerror=alert(1)>`. The regex fails to match `onerror` without quotes, resulting in stored Cross-Site Scripting (XSS).
- **CWE / OWASP:** CWE-79 (Improper Neutralization of Input During Web Page Generation) / OWASP A05:2025 Injection.
- **Suggested Fix:** Replace custom regex sanitization with an established HTML sanitizer library such as `DOMPurify` (isomorphic-dompurify / sanitize-html).

---

### SEC-07 — JWT Access & Refresh Tokens Stored in `localStorage`
- **Severity:** Low
- **Location:** [apps/web/src/lib/api.ts:20,46](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/web/src/lib/api.ts#L20-L46)
- **Description:** JWT access and refresh tokens are saved in browser `localStorage`.
- **Impact Scenario:** If an XSS vulnerability occurs anywhere on the domain, an attacker's script can read `localStorage.getItem('token')` and `localStorage.getItem('refreshToken')` to steal user sessions.
- **CWE / OWASP:** CWE-922 (Insecure Storage of Sensitive Information) / OWASP A04:2025 Cryptographic Failures.
- **Suggested Fix:** Store refresh tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies, keeping access tokens in-memory.

---

### SEC-08 — Stateless Logout Endpoint Without Token Revocation
- **Severity:** Low
- **Location:** [apps/api/src/routes/auth.ts:169](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/routes/auth.ts#L169)
- **Description:** `POST /api/auth/logout` only returns a success message without invalidating or blacklisting active JWT tokens on the server side.
- **Impact Scenario:** If a user logs out on a shared terminal, an attacker possessing the stolen access token can continue accessing the API until token expiration (1 hour).
- **CWE / OWASP:** CWE-613 (Insufficient Session Expiration) / OWASP API Security Top 10:2023 API2 (Broken Authentication).
- **Suggested Fix:** Implement a token deny-list (e.g. in Redis/database) or short-lived access tokens combined with cookie-based refresh token revocation upon logout.

---

### SEC-09 — Default Hardcoded JWT Secret Fallback
- **Severity:** Informational
- **Location:** [apps/api/src/plugins/auth.ts:27-29](file:///c:/Users/Maur%C3%ADcio/Downloads/escola/apps/api/src/plugins/auth.ts#L27-L29)
- **Description:** A default fallback secret string is provided when `JWT_SECRET` is not set in non-production environments.
- **Impact Scenario:** If an environment is deployed without setting `NODE_ENV=production` or `JWT_SECRET`, tokens generated with the hardcoded default secret can be forged by an attacker.
- **CWE / OWASP:** CWE-1188 (Use of Insufficiently Random Values) / OWASP A02:2025 Security Misconfiguration.
- **Suggested Fix:** Mandatory check for `JWT_SECRET` across all environments during application start.

---

## Prioritized Action Plan

1. **Immediate (High Priority):**
   - Rotate the Neon PostgreSQL credentials and Gemini API keys exposed in `.env`.
   - Update `POST /api/auth/register` to prevent clients from specifying the `role` field.
   - Enforce teacher ownership validation in `PUT /api/questions/:id` and `DELETE /api/questions/:id`.
   - Restrict `GET /api/admin/export-db` to `ADMIN` role only.

2. **Short-Term (Medium Priority):**
   - Upgrade vulnerable dependencies (`esbuild`, `vite`) via `pnpm update`.
   - Replace custom regex in `lib/sanitize.ts` with `isomorphic-dompurify` or `sanitize-html`.

3. **Long-Term (Best Practices):**
   - Migrate authentication token storage from `localStorage` to `HttpOnly` cookies.
   - Implement refresh token revocation storage on logout.
