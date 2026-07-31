---
name: code-quality-review
description: Performs secure-coding and hardening reviews of web applications, APIs, databases, and infrastructure, identifying risky patterns such as SQL/NoSQL/command injection, XSS, CSRF, IDOR and other broken access control issues, SSRF, exposed secrets, authentication and session weaknesses, insecure configuration, unsafe file uploads, and outdated dependencies. Use this skill whenever the user asks to review code quality, check for insecure patterns, review authentication or authorization, or assess whether an endpoint, feature, or Pull Request follows secure coding best practices before shipping, even when the word "security" isn't used explicitly, such as in "take a look at this endpoint before I commit" or "is this ready for production".
---

# Secure Coding & Hardening Review

This skill turns the agent into a code reviewer focused on secure coding practices, covering front-end, back-end, database, APIs, authentication/session, dependencies, and infrastructure. Based on the OWASP Top 10:2025 (current version, published January 2026) and the OWASP API Security Top 10:2023.

## When to activate
Whenever the request involves, even implicitly: secure coding review, "is this following best practices?", pre-production review, authentication, authorization, data exposure, or review of a Pull Request/diff touching routes, forms, authentication, file upload, database access, or calls to external services.

## Methodology
1. Recon — map the stack, external data entry points (routes, forms, uploads, query params, headers, webhooks, jobs), and sensitive config files.
2. Automated checks — run the dependency-check tool appropriate to the detected stack (npm audit, pip-audit, bundler-audit, composer audit, govulncheck), search for secrets committed to Git history, and run static analysis linters if already configured (semgrep, bandit, eslint-plugin-security). If something isn't available, log it as a limitation and continue manually.
3. Manual layer-by-layer review — use the checklist below.
4. Report — structure findings per "Report format" below.

## Checklist by layer
- Front-end — XSS, secrets exposed in the client bundle, sensitive tokens in localStorage/sessionStorage, CSRF, security headers (CSP, anti-clickjacking), outdated front-end dependencies, open redirects.
- Back-end — injection (SQL, NoSQL, command, LDAP, XXE, SSTI), IDOR/broken access control, missing authorization on privileged routes, SSRF, insecure deserialization, unsafe file upload, path traversal, verbose errors in production, rate limiting, business logic flaws.
- Authentication & session — password hashing algorithm, password-reset flow, JWT configuration, cookie flags (HttpOnly/Secure/SameSite), OAuth/OIDC (state, PKCE, redirect_uri), MFA.
- Database — parameterized queries/ORM on 100% of access paths, least-privilege connection user, encryption at rest, real credentials in versioned seeds/migrations.
- APIs (OWASP API Security Top 10:2023) — BOLA, broken authentication, excessive data exposure/mass assignment, missing rate limiting, function-level authorization across roles, misconfigured CORS, forgotten/debug endpoints, input schema validation.
- Infrastructure — secrets in code/Git history, incomplete .gitignore, committed .env, Dockerfile running as root, secrets in CI/CD, global security headers, mandatory HTTPS, debug mode in production.

## Severity classification
| Severity | Criteria |
|---|---|
| Critical | Reachable remotely without authentication; could lead to full compromise, account takeover, or a massive data leak |
| High | Requires authentication, but allows accessing/altering other users' data, or exposes secrets |
| Medium | Requires a specific condition or victim interaction to trigger |
| Low | Low-impact information leak, missing security header |
| Informational | Best practice not followed, no direct impact identified |

## Report format
When a full review is complete, produce (or update) CODE_REVIEW_FINDINGS.md with: executive summary (count by severity) → findings table ordered by severity → for each finding: title, severity, exact location (file:line), description, realistic impact scenario (how it could be misused, in plain terms), reference (CWE / OWASP category), and suggested fix → prioritized action plan at the end. For one-off reviews (a single endpoint or PR), answer directly in the conversation using the same format.

## Rules and limits
- Never reproduce a found secret/password/key in full — report its location and recommend rotation.
- Don't auto-fix issues without explicit user confirmation, except trivial, reversible fixes (e.g., adding a missing header) — and even then, ask before applying.
- Avoid lazy false positives: flag uncertain cases as "possible false positive" and explain why instead of omitting them or asserting certainty.
- Be specific: cite file, line, and, when it makes sense, an example input that demonstrates the issue. "Possible validation issue" without details is not a useful finding.

## Reference — current categories
OWASP Top 10:2025: A01 Broken Access Control (incl. SSRF), A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software/Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions.
OWASP API Security Top 10:2023: API1 BOLA, API2 Broken Authentication, API3 Broken Object Property Level Authorization, API4 Unrestricted Resource Consumption, API5 Broken Function Level Authorization, API6 Unrestricted Access to Sensitive Business Flows, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs.
