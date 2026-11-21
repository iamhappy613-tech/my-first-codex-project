# Private GPT Learning Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a configurable account-backed vocabulary website and a private GPT data bridge, without calling a paid model API or interrupting the existing local website.

**Architecture:** Keep a directly openable, self-contained index.html. Testable JavaScript source modules are embedded into it by a native Node maintenance script. Supabase provides authentication, PostgreSQL RLS/CAS functions and two isolated HTTP functions: administrator operations and fixed-owner GPT access.

**Tech Stack:** HTML/CSS/native JavaScript, PostgreSQL, Supabase Edge Functions, Node built-in tests, Chromium/Playwright; Docker PostgreSQL for permission tests. No application build tool or model API dependency.

**Spec:** docs/superpowers/specs/2026-11-21-private-gpt-learning-coach-design.md and docs/superpowers/specs/2026-11-20-accounts-and-admin-design.md.

## Global Constraints

- Every study day contains at most 43 distinct words; unfinished and unfamiliar words carry forward.
- Open registration; verified email; only the configured owner can use the private GPT bridge.
- Frontend never contains a service-role key or GPT connection secret. No OpenAI model API calls.
- Progress, local cache and pending writes are scoped to authenticated UUID. Legacy guest import is explicit.
- Version-checked writes; stale proposals and duplicate adoption cannot overwrite or repeat work.
- Default deployment remains local mode until real service configuration is supplied and verified. Cloud mode fails closed.
- Existing main-branch checkout is the already-authorized workspace; do not create another worktree.

## Review Focus

- Auth expiry or account switch while a save is in flight must not write another user's cache or hide unsynced work (Task 4).
- Disabled accounts with unexpired JWTs must lose database and GPT access (Tasks 2–3).
- A catalog expansion must not reset legacy mastery/history or assign all new words automatically (Task 1).
- Duplicate/stale proposal adoption and simultaneous saves must be atomic (Tasks 2–4).
- API keys, SMTP setup and actual Plus Actions connectivity are external prerequisites, never replaced by fake success (Tasks 3, 6).

## Task 1: Stable study core and catalog

**Files:** supabase/functions/_shared/core.js; data/catalog.json; scripts/embed.mjs; tests/core.test.mjs.
**Interfaces:** `WordspaceCore.validatePlan(state,catalog)`, `migratePlan(state,catalog)`, `summarize(state,evidence)`, `candidates(state,catalog,evidence)`, `applyNextDay(state,proposal)`, `scoreAssessment(...)`.
- [x] Write literal migration, carry-priority, 43-limit, malformed data, catalog growth and assessment tests; run to observe missing behavior.
- [x] Implement stable IDs and a study-deck snapshot independent of catalog version; preserve 300-word legacy progress. Generate source seed from the current array.
- [x] Run `node --test tests/core.test.mjs`; all pass; commit.

## Task 2: Database permissions and transactional writes

**Files:** supabase/migrations/202611210001_accounts.sql; supabase/seed.sql; tests/database.test.mjs; scripts/test-db.mjs.
**Interfaces:** tables profiles, word_catalog, study_progress, assessment_events, recommendations; RPC `save_progress(expected_revision, state)`, `set_account_status(target,enabled)`, `submit_assessment(...)`, `adopt_recommendation(id,expected_revision)`.
- [x] Write database tests for two-user isolation, role escalation, blocked old JWT, CAS, malformed/oversize state, concurrent adoption and event idempotency; run against PostgreSQL before migration.
- [x] Implement restricted grants, explicit active-account checks, fixed search paths, atomic revisions and owner-only administration. Seed the checked catalog.
- [x] Run database tests against an isolated Docker PostgreSQL with simulated auth.uid claims; commit.

## Task 3: Authenticated administrator and GPT functions

**Files:** supabase/functions/_shared/http.js; supabase/functions/admin/index.ts; supabase/functions/coach/index.ts; supabase/config.toml; tests/http.test.mjs.
**Interfaces:** `createAdminHandler({env,fetch})`, `createCoachHandler({env,fetch})`; summary/evidence/candidates/proposals GET/POST endpoints under `/functions/v1/coach`.
- [x] Write Request/Response boundary tests for missing/wrong credentials, account status, user_id injection, pagination, bounded body/rate, proposal validation and redacted errors.
- [x] Implement isolated custom bearer-secret authentication for coach; validate website JWTs for admin, recheck roles server-side. No model endpoint. Keep all ownership derived server-side.
- [x] Run `node --test tests/http.test.mjs`; commit.

## Task 4: Login, scoped sync and administrator UI

**Files:** web/account.js; index.html; tests/browser.mjs; scripts/embed.mjs.
**Interfaces:** account controller gates study initialization; `loadForUser`, `persist`, `flush`, `openCoach`; cloud transport uses Auth REST and RLS RPCs.
- [x] Write browser tests for unchanged local mode, cloud login gate, signup/recovery, explicit legacy import, denied accounts, logout, two-account cache separation, refresh, offline dirty writes and CAS conflict.
- [x] Implement login/recovery/import/conflict panels, session refresh, account-scoped cache, bounded retry and sync timestamps. Render data with textContent. Preserve original study/voice functions and mobile controls.
- [x] Implement administrator list/search/pagination and disable/restore via protected function; add browser tests proving ordinary users cannot use admin controls.
- [x] Run browser and core/backend suites; commit.

## Task 5: Assessments and recommendation adoption

**Files:** web/account.js; index.html; tests/browser.mjs; tests/core.test.mjs.
**Interfaces:** objectively scored website checks feed assessment_events; proposals are pending until explicit website adoption for the next day.
- [x] Write tests for hidden-answer first attempts, stable event IDs, stale proposals, adoption once, preserved history and mandatory carry.
- [x] Add short checks, distinction between self-report and tested evidence, due-review display, proposal preview/ignore/adopt and updated GPT entry. Do not advertise a precise vocabulary-size estimate.
- [x] Validate all registered catalog entries before offering them; unreviewed candidates remain unavailable. Expand licensed/sourced reviewed vocabulary where content can be verified; never manufacture review status to meet a count.
- [x] Run complete tests; commit.

## Task 6: GPT package, deployment and review

**Files:** gpt/openapi.json; gpt/openapi-smoke.json; gpt/smoke.json; gpt/instructions.md; docs/DEPLOYMENT.md; scripts/configure.mjs; README.md.
- [x] Add a public synthetic-only smoke endpoint and importable OpenAPI; production schema declares authentication and consequential proposal writes, contains no secrets and grants no direct progress mutation.
- [x] Deliver private-GPT instructions enforcing fresh reads, data time/source, candidate IDs, honest tool failures and no fabricated saves.
- [x] Provide Supabase project, migration, owner bootstrap, connection-secret hashing, mail, function deployment and GPT-editor instructions. Production activation requires real config and live checks.
- [x] Verify OpenAPI paths against the real handler, generated HTML matches source, local browser regression, SQL permissions and secret-free artifacts.
- [x] Fresh whole-change review; fix material findings with failing regression tests; commit and push the verified, nonblocking default. Report external live setup and any unreviewed expansion content distinctly.

## Execution Notes

User approved the design and explicitly asked to start. Execute natively in the current isolated cloud checkout without another approval loop. Record task proofs and meaningful rulings in the local ledger; keep real-service activation blocked until external credentials/configuration exist.
