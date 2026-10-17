# Living village cast implementation plan

> **For agentic workers:** Use superpowers:executing-plans in the existing feature checkout. Steps use checkbox syntax.

**Goal:** Match the referenced Settlement village presentation with the user's six illustrated characters visibly working in Village Sentinel.
**Architecture:** Keep the tested strategy reducer and AI mission backend. Add a separate deterministic crew reducer that executes existing village commands, plus a painted map and character inspector. Keep all mission evidence and its separate-state disclosure.
**Tech Stack:** Existing native browser modules, SVG, CSS, Node tests, Chrome browser tests. No new runtime dependencies.
**Spec:** User's Oct 16 reference and attached cast, plus the design below; continuing the authorized village strategy implementation.

## Design and constraints
- Reference: Settlement-Village at cb766635301ee0dd627029944b3bb89388f07d0d. Use its MIT terrain/building art with explicit prior-work attribution; do not modify the source repository.
- User's six identities: Mira, Pip, Bea, Gus, Luna, Nimbus. Preserve the original mission roles; describe campaign work as local game AI, not model inference.
- Full-width painted valley leads. Compact forest-green HUD (#203d37), warm gold controls (#e8c987), grass green (#95b947), pale text (#fff4d5), river teal (#58bcb9). Existing rounded sans for controls; Georgia headings echo the reference. Character art is the focal point.
- Native implementation is the agent's choice, preserving existing source, saves, API and budget constraints. No AWS resources or paid API calls.
- Each character is selectable on the map and in a crew rail. Inspector shows job, route/wait reason, deliveries and mission role. Rest lasts 20 ticks.
- Three orders: gather 12 deliveries; grow with one farm, camp and tower (ceiling 200 coins/120 timber); fortify to 42 defense and full integrity (ceiling 240/180). Construction protects 20 coins/20 timber and uses the same validated commands as manual play.
- Paths avoid buildings. Jobs replan when a destination becomes occupied. Payments happen on successful completion only; cancellation/rest/saving never double charges.
- Existing building production, raids and victory rules stay compatible. Crew resource deliveries are additional game rewards. No offline progress.

## Review focus
- A manually occupied construction destination replans without double spending (Task 1).
- Low funds and blocked routes remain visibly waiting (Task 1).
- Reload mid-job preserves counters/budgets and recomputes safe routes (Task 1).
- Character/roof overlays do not block placement or keyboard selection (Task 2).
- Phone layout and old saved villages still load; mission modes remain truthful (Task 2).

### Task 1: Crew simulation
Files: web/public/crew-state.mjs; web/tests/crew.test.mjs.
Interfaces: newCrew(), chooseOrder(crew,kind), tickCrew(village,crew)->{village,crew}, restCrew(crew,id,tick), restoreCrew(raw,village).
- [ ] Write failing tests for resource deliveries, finite construction, reserve/cap limits, replan/rest/cancel, blocked paths, save recovery.
- [ ] Implement the pure reducer and bounded validation; run Node suite and commit.

### Task 2: Painted world and character UI
Files: strategy-map.mjs, strategy.mjs, strategy.css, crew-view.mjs, index.html, server.mjs, assets; web/crew-browser.test.mjs.
- [ ] Add browser behavior checks for six sprites, orders, inspection/rest, local saves, mobile placement and mission navigation; observe failure.
- [ ] Integrate atlas, painted terrain, map camera, crew controls and truthful mission status. Preserve prior selectors and workflow.
- [ ] Inspect desktop/mobile screenshots, run strategy/recovery and mission browser checks; update attribution and user docs.

### Task 3: Review and public release
- [ ] One fresh review, address important findings, run relevant final checks.
- [ ] Push existing feature PR; publish recorded static site with source hashes; test public URL; update source ZIP and handoff.
