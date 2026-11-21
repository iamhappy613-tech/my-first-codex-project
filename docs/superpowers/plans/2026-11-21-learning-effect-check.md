# Learning Effect Check Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current feature branch. Steps use checkbox syntax for tracking.

**Goal:** Add one-click, studied-word assessment rounds and useful reports to the existing Wordspace pages.

**Architecture:** A small browser-compatible assessment module owns question selection, question construction and round reporting. The account controller owns display, first-choice submission and account lifecycle, reusing the existing assessment RPC. Both standalone HTML snapshots embed the same source.

**Tech Stack:** Existing vanilla JavaScript/HTML/CSS, Node built-in test runner, existing Supabase APIs and GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-21-learning-effect-check-design.md` (approved in chat on 2026-11-21).

## Global Constraints

- At most10 unique studied target words per round; no new study tasks or model API calls.
- Keep progress, history, roles, secrets and recommendation adoption unchanged.
- Reviewed catalog content only; answers/translation appear after the first selection.
- At least24 hours for retention evidence; no invented retention percentage.
- Continue on `feat/learning-effect-check`; the user cancelled worktree creation, so do not retry it.

## Review Focus

- Account switches or a slow submission must not reveal the previous learner's round/report.
- Empty or fewer-than10 studied words must produce an honest, usable state.
- Missing evidence must not fabricate due words or prevent a studied-word practice round.
- Repeated clicks, interrupted rounds and failed sync must not inflate correctness or claim a save.
- A cloud snapshot must receive the same feature while retaining its existing public configuration.

### Task1: Selection, question construction and reporting

**Files:** Create `web/assessment.js`, `tests/assessment.test.mjs`; modify the existing Windows preview test cleanup in `tests/assets.test.mjs`.

**Interfaces:** Expose `WordspaceAssessment.studiedIds(plan)`, `buildRound(plan,catalog,evidence,now,random)` and `summarizeRound(questions,answers)`. Questions have a reviewed `word`, `type`, `prompt`, unique `{id,label}` options and `delayed` eligibility. Reports include total, answered, correct, rate, wrong IDs and delayed attempts/correct.

- [ ] Write tests proving studied-only targets, due/weak priority, uniqueness/cap, cloze masking/fallback, duplicate choices, insufficient/empty sets, delayed eligibility and partial/first-choice reporting.
- [ ] Run `node --test tests/assessment.test.mjs`; expected new behavior absent.
- [ ] Implement the module, without touching study progress.
- [ ] Await preview subprocess exit before removing its temporary cwd; existing failing Windows cleanup is the regression proof.
- [ ] Run `node --test tests/*.test.mjs`; expected all pass. Commit Task1.

### Task2: Account-scoped round UI

**Files:** Modify `web/account.js`, `web/learning-ui.html`, `web/account.css`; add assessment UI tests in the available isolated test runtime.

**Interfaces:** Consume Task1 module and existing `submit_assessment` payload unchanged. Use `assessment-start`, `assessment-next`, `assessment-end`, `assessment-progress`, `assessment-report` plus existing question/options/feedback nodes.

- [ ] Add failing UI coverage for one first-choice submission, two question types, report/end behavior, empty/loading/error states and account switch during delayed submission.
- [ ] Implement round rendering, native keyboard-accessible buttons, wrong-word review and honest pending-sync feedback. Reset round state on account lock and guard async completion by account epoch and round identity.
- [ ] Verify the targeted UI checks plus the full unit suite. Commit Task2.

### Task3: Snapshots, full verification and publication

**Files:** Modify `scripts/embed.mjs`, `index.html`, `cloud-preview.html`, README and relevant browser checks; preserve each page's public config.

- [ ] Add failing coverage for cloud snapshot synchronization/config preservation; include the assessment module before account code.
- [ ] Generate both pages and run `node scripts/embed.mjs --check`, full unit suite and available browser regression checks; inspect mobile and desktop layouts.
- [ ] Have one fresh reviewer inspect the completed change; fix material findings with focused regression proof.
- [ ] Commit verified changes, publish through the existing repository/Pages path, and verify the live cloud page contains the new assessment UI.

## Execution Notes

Baseline: 25/26 unit tests passed; `tests/assets.test.mjs` fails on Windows with EBUSY because it kills a preview child without waiting for its cwd to be released. No product defect has been inferred from that cleanup failure.
