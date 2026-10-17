# Repo context: API-test-framework-tutorial

Source: https://github.com/vicgoodall/API-test-framework-tutorial, branch `solution/2026-10-13` (HEAD `1f56e08 Implement homework 005`).
Local clone: `C:\Users\jo126787\repos\API-test-framework-tutorial`.
This file is a reading aid written by Claude. It is not part of the upstream repo.

## What this repo is

A fork of the Lean Software Production course starter ("capstone-project-starter"). It holds two things:

1. **A software factory** (`factory/`): a C# program that turns a written spec into software by running coding agents. It is built across seven homeworks. `factory/ITERATION` is `005 Done` (homework 5, "fan out").
2. **The capstone product** (`atft/`): ATFT, the API Test Framework Tutorial. It is a React/TypeScript web app that teaches API test automation in an IDE-style UI. The factory/agents built it, and the link you gave (`atft/src/App.css`) is in this app.

`tetris/` holds the shared practice targets (`tetris-003`, `tetris-004`) that the factory built along the way. They are not the capstone.

## Top-level layout

| Path | Purpose |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Agent instructions (`CLAUDE.md` just imports `AGENTS.md`). Describes the skills and the rule "don't edit `factory/spec/`". |
| `README.md` | Course starter guide: Codespaces, Codex and Pi sign-in, `bin/doctor`, fetch and coach loop. |
| `.agents/skills/` | Skills: `fetch-iteration`, `set-up-factory`, `coach-me`, `implement-it`, `implement-fast`. `.claude/skills` points at them. |
| `.devcontainer/` | Node plus Pi, Claude Code and Codex CLIs. |
| `bin/doctor`, `bin/factory` | Environment check, and a symlink to the factory entry point (`factory/factory`). |
| `factory/` | The student's factory (C#, .NET 8, Reqnroll). Details below. |
| `atft/` | The capstone web app. Details below. |
| `tetris/` | Practice seed (`spec.md`) and generated games. |
| `tools/pi-rpc-acp/` | Bridge that lets the factory run Pi as an ACP agent. |

## The factory (`factory/`)

- `spec/` is the fetched homework (README, `FACTORY.md`, feature files). It is **read-only** because the course owns it. The feature files are the factory's acceptance tests.
- `src/`: `Program.cs` (CLI), `FactoryRun.cs`, `AssemblyLine.cs` (parses the Graphviz-subset `.dot` lines and runs them, including the fan-out and fan-in added in homework 5).
- `tests/`: Reqnroll step definitions (`FactorySteps.cs`, `FanOutSteps.cs`), test doubles for agents (`Doubles/`), and `reqnroll.json`.
- `./test` runs the suite (excludes `@real-agent`; `--real-agent` includes it). It needs the .NET 8 SDK.
- `README.md` and `FAN-OUT.md` document usage. Key concepts:
  - A **run** has a name, target, line and seed. Its state lives in `factory/runs/<name>/` (git-ignored). The plan is `plan.md`.
  - A **line** is a `.dot` graph in `<target>/.assembly-lines/`. Nodes are machines. Edge labels such as `complete` or `not satisfied` route on a machine's result.
  - A **machine** is configured in `<target>/.assembly-lines/.machines/<name>/config.json` (role, harness, lens, instructions, optional provider and model).
  - **Fan-out** is a node with several unlabelled outgoing edges. They run concurrently and must join at one machine. A failed branch stops the run.
- Typical command: `bin/factory --run tetris --target tetris/tetris-003 --line careful --seed tetris/spec.md`.

## ATFT, the capstone app (`atft/`)

**Purpose** (from `docs/vision.md`): an IDE-style tutorial where a learner who can code but is new to API test automation builds one complete test. It has a Gherkin feature, C# Reqnroll step definitions and request/response models. The scenario is recording a vaccination through a FHIR R4 `POST /Immunization`.

**Hard boundaries** (`docs/iterations/001-.md`, status "Agreed", the full spec):
- Everything is simulated. No C# is compiled or run, and no HTTP requests are sent.
- It teaches C# HttpClient + Reqnroll + NUnit assertions. Selenium is excluded, which overrides the vision for this iteration.
- Only targeted "gaps" in starter code are editable. Everything else is read-only.
- There is no backend, accounts, error scenarios, FHIR SDK or export. Progress is stored in `localStorage` only.
- Fixtures are fixed: learner `Patient/patient-001`, "Influenza vaccine", `2026-01-15`, `TRAINING-FLU-001`, `imm-001`. The worked example uses `patient-002`, "Hepatitis B vaccine", `2026-02-20`, `TRAINING-HEPB-002`, `imm-002`. Service base is `https://fhir.example.test/`.

**Lesson flow** (5 lessons, unlocked sequentially):
1. Understand the API (reading, then Continue).
2. Describe the behavior (Gherkin gaps).
3. Model the data (`Immunization.cs` gaps).
4. Build the request (Given/When gaps in `RecordVaccinationSteps.cs`).
5. Verify the response (Then gaps), then **Run simulated test** shows assembled code, the HTTP exchange, Given/When/Then results and a recap.

Each coding lesson has Check my work, Show solution (shown beside the editor, never auto-applied) and a worked example. Editing a passed answer invalidates that lesson and disables the final simulation until it passes again. "Start over" clears saved progress.

**Stack and commands**: React 19, TypeScript 6, Vite 8, Vitest (jsdom), Playwright (Chromium, against `npm run preview` on port 4173). Needs Node >= 22.
`npm install`, `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run preview`, `npm test`, `npm run test:e2e`.

**Source map** (`atft/src/`):

| File | Role |
| --- | --- |
| `main.tsx` | Mounts `<App />`. |
| `App.tsx` (838 lines) | The whole UI. Helpers: `CodeBlock`, `SegmentRenderer` (renders gaps as inputs), `FixtureDisplay`, `SimulationView`. Wires lessons, validation, persistence and progression. |
| `App.css` (565) / `index.css` (111) | Layout (sidebar + main, `.app-container`) and theme variables (`--bg`, `--text`, `--border`). |
| `lessons.ts` (612) | Lesson content. `GapId` union, gap definitions with accepted answers and feedback, the learner and worked code files built from templates, and `lessons[]`. |
| `validation.ts` | `normalizeGap` (trims; dotted C# expressions also have whitespace around dots removed), `validateGap`, `validateGaps`, `assertGapCoverage`. |
| `progression.ts` | `createProgressionEngine`. Lesson statuses are `locked`, `available`, `needs-check` and `complete`. |
| `persistence.ts` | Versioned `localStorage` state (key `atft.iteration001.progress.v1`). Covers load, save, clear, validation, and falling back to memory when storage fails. |
| `fixtures.ts` | Fixed request, response and header fixtures. |
| `*.test.ts` | Unit tests for each module. Persistence has the most (645 lines). |

**E2E** (`atft/e2e/`): `tutorial.spec.ts` plus a `TutorialPage` page object. Scenarios are the happy path through simulation, wrong-answer retry, solution reveal not mutating inputs, refresh restore, editing an earlier answer invalidates completion, and reset cancel/confirm.

`atft/.factory/plan.md` is the factory's task plan for this target.

## Working notes

- `factory/spec/` and the course skills are course-owned. Don't edit them. `atft/docs/` and `atft/spec.md` are the product spec.
- `atft/test-results/` and the `.factory/` plan are committed artifacts. Treat them as generated.
- I have not run `npm install`, the tests or the .NET suite. This summary comes from reading the docs and structure only. `atft/src/App.tsx` and `atft/src/lessons.ts` were skimmed, not read line by line.
