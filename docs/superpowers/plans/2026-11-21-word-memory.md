# Word Memory Notes Implementation Plan

> **For agentic workers:** Root uses superpowers:executing-plans inline; three disjoint content curation tasks follow dispatching-parallel-agents. No shared source edits by curators.

**Goal:** Show accurate, concise word composition/memory notes for the existing vocabulary.
**Architecture:** Reviewed per-word notes remain in separate JSON fragments; a small browser module looks up by ID and renders safe text, with honest whole-word fallback. Both HTML pages embed the same notes, independent of cloud catalog rows.
**Tech Stack:** Existing vanilla JS/HTML/CSS, native Node tests, Playwright fixtures, GitHub Pages.
**Spec:** `docs/superpowers/specs/2026-11-21-word-memory-design.md`.

## Global Constraints

- No fabricated roots; distinguish modern affixes, compounds, word-family associations and whole-word memory.
- Historical root analyses require a directly checked primary dictionary URL.
- Preserve catalog definitions, account data, daily43-word rule, assessments and recommendation adoption.
- Work on `feat/word-structure-memory`; do not retry cancelled worktree creation.

## Review Focus

- Incorrect semantic or spelling splits, especially false prefixes in opaque words.
- Missing/duplicated IDs across1000 classifications; unsafe historical claims without sources.
- Cloud merges must retain local explanations; unknown future entries need a safe fallback.
- Notes must remain hidden on card front and must render as text, never executable markup.
- Long bilingual text must fit at320/390px and both HTML pages must stay current.

### Task1: Curate content and lookup module

**Files:** `data/memory-notes/{core,expansion-a,expansion-b}.json`, `web/word-memory.js`, `tests/word-memory.test.mjs`.
**Interfaces:** `WordspaceMemory.describe(entry, notes?) -> {kind,label,structure,explanation,tip}` and `WordspaceMemory.render(container,entry)`.
- [x] Add failing lookup/fallback tests; implement the lookup and safe DOM rendering.
- [x] Integrate three disjoint curation files; test exact catalog coverage, allowed kinds, bounded fields and root-source requirements.

### Task2: Display and embedding

**Files:** `web/study.js`, `web/account.js`, `web/account.css`, `index.html`, `scripts/embed.mjs`; relevant browser fixtures.
- [x] Add failing UI coverage for hidden front, visible detailed/whole-word notes on the back, word list, account catalog refresh and mobile fit.
- [x] Add the memory block and shared rendering; include flipped-card accessibility text.
- [x] Embed curated notes into the module in both pages without changing each page's public config or the database seed schema.

### Task3: Verify and publish

- [x] Run full Node suite, assessment/auth browser regressions and1000-word mobile card layout checks.
- [x] Read-only review of content risks and implementation; address material findings with targeted evidence.
- [ ] Commit, fast-forward main and publish by the existing GitHub Pages path; compare live pages to the pushed snapshot.

## Verification evidence

- All1000 IDs covered exactly once:485 detailed notes (154 affix,319 family,12 compound),515 whole-word cues;33 deduplicated primary references. No unsupported historical-root entries.
- Tests observed failing before implementation, then passing:6 targeted memory tests; full44 Node tests;24 existing browser scenarios;10 assessment scenarios; memory UI including wrong-word report and cloud catalog refresh; all1000 cards at320/390px.
- Content review covered all461 original detailed entries, then24 added reverse family links and the final frontend. Corrected private/production stress wording and clarified soft versus software.
- Database integration script could not start because Docker is absent (`spawnSync docker ENOENT`). This change has no migrations, database writes or backend changes.
