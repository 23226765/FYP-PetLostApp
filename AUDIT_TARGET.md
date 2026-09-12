# AUDIT_TARGET — Auth input validation & error mapping

## Target Subsystem & Feature
Registration/login backend (`server/controllers/authController.js`).

## Files to Inspect
- `server/controllers/authController.js`
- `server/middleware/errorHandler.js`

## Bug Risks
- `register`/`login` only check field presence — no email-format or password-length validation; `name` length is unbounded.
- Duplicate-email race: concurrent registers pass `findOne`, then the unique index throws `E11000`, surfaced as a generic 500 with raw driver text (not 409).
- No rate limiting on login (brute force).

## Refactoring Goals
1. Validate inputs: email regex, password ≥ 6 chars, name ≤ 100 chars → 400.
2. Map `E11000` → 409 in `errorHandler`; never leak raw `err.message`.
3. Add a lightweight in-memory login rate limiter.

