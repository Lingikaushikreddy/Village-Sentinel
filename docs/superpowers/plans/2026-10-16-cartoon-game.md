# Cartoon Live Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing agent with a playable, truthful cartoon game and a clear judge walkthrough.

**Architecture:** A Node server owns scene state, engine stepping and command deduplication. A plain browser interface animates world snapshots and presents live or recorded traces. The existing Python service owns Decider/Bedrock calls and its usage ledger.

**Tech Stack:** Node >=22.13 (verify on 26.8.1), SQLite, browser modules, SVG/CSS, Python 3.12, pinned settlement-testbed 0.12.0.

**Spec:** ../../PLAYER-EXPERIENCE.md. Continues the user-approved project design and execution; current user explicitly requests completion and a working cartoon game.

## Global Constraints

- Preserve the current remote implementation and existing evidence bundle.
- Six distinct teaching roles; actual engine names and state remain truthful.
- Local Bedrock stub/recorded operation is always labeled; no fabricated live confidence or AWS claim.
- Replay and GET polling never trigger model calls.
- Commands are versioned and durable; duplicate clicks cannot duplicate provider requests.
- No secrets in the browser, repository, evidence or logs.
- User's AWS account is still being created; no billable resources in this pass.

## Review Focus

- A duplicate command while inference is pending must not invoke the source twice (Task 1).
- A provider outage or stub must not appear as a successful live model decision (Tasks 1/3).
- Malformed HTTP input, cross-origin mutation and arbitrary file paths must fail clearly (Task 2).
- A recorded walkthrough must preserve recorded answers and make zero model calls (Tasks 1/3).
- A narrow screen/reduced motion user must retain understandable roles and working controls (Task 3).

### Task 1: Durable game loop and trace adapter

**Files:** engine/live-adapter.mjs; web/game.mjs; web/store.mjs; web/provider.mjs; web/tests/game.test.mjs.

**Interfaces:** Adapter exposes create/advance/pending/buildRequest/toSocialDecision/verifyReplay. GameManager({store, source}) exposes create({scene, mode}), get(id), step(id,{commandId,expectedVersion}) and export(id); source returns {answer, trace, provider} for a permitted request. Game state contains a world frame, pending request, history and explicit provenance.

- [ ] Write failing tests for one real engine transition, duplicate concurrent commands, changed command payload, stale version, replay with no source and unavailable provider.
- [ ] Run `node --test web/tests/game.test.mjs`; expect feature-missing failures.
- [ ] Implement the smallest adapter, SQLite store, live source and recorded source satisfying those cases. Keep full engine state server-side.
- [ ] Run all Node tests and existing Python tests; expect green. Commit the game loop.

### Task 2: HTTP app and operating scripts

**Files:** web/server.mjs; web/tests/server.test.mjs; package.json; scripts/start-game.sh; .gitignore.

**Interfaces:** GET /api/health, /api/scenes, /api/runs/:id and /api/runs/:id/export; POST /api/runs and /api/runs/:id/step. Serve only static files under web/public. Service URL is server configuration, never a browser argument.

- [ ] Write failing HTTP tests for body/scene/version validation, cross-origin rejection, health provenance and path traversal.
- [ ] Run `node --test web/tests/server.test.mjs`; expect missing server failures.
- [ ] Implement endpoints, bounded requests, clear status codes and a one-command local launcher with cleanup.
- [ ] Run Node/Python suites; expect green. Commit server wiring.

### Task 3: Illustrated playable interface

**Files:** web/public/index.html, app.mjs, styles.css, village.mjs, characters.mjs, assets/character-cast.png; browser QA script in work/ only.

**Interfaces:** Browser uses Task 2 endpoints; render world/trace provenance without sending engine secrets back to models. Six character controls explain responsibilities; map movement comes from snapshot locations.

- [ ] Use browser behavior checks for scene creation, step, replay, character roles, probability disclosure, degraded mode and mobile viewport.
- [ ] Implement the original village stage and character panels, clear judge sequence, evidence export and readable action/result labels.
- [ ] Exercise recorded scenes and actual local Decider requests. Keep missing Bedrock/AWS explicit. Verify screenshots and fix visual issues.
- [ ] Run suites and browser flows; expect green. Commit interface.

### Task 4: Readiness and release handoff

**Files:** README.md; docs/JUDGE-GUIDE.md; docs/DEPLOYMENT.md; deploy/; ATTRIBUTION.md.

- [ ] Document exactly what is real, recorded, stubbed and pending; add an under-three-minute demo outline.
- [ ] Prepare a reviewable AWS deployment recipe and budget controls without creating paid resources.
- [ ] Verify the new interface, existing bundle and test suites; obtain one fresh whole-change review.
- [ ] Fix Important/Critical findings with failing regressions, package updated source, push the authorized branch and create/attach a PR. Leave the local game running and open its browser view.
