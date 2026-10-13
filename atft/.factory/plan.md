# Plan — Iteration 001: Record a vaccination tutorial

## Tasks

- [x] Set up React + TypeScript + Vite project under `atft/` with `package.json`, lockfile, and documented supported Node version
- [x] Add npm scripts: `dev`, `build`, `preview`, `test`, `test:e2e`
- [x] Configure Vitest and Playwright for unit and browser tests
- [x] Create canonical fixture source (patient references, vaccines, dates, lot numbers, expected request/response) shared by all modules
- [x] Build lesson data module with text, code templates, gap definitions, and canonical answers for all 5 lessons
- [x] Build pure validation/normalization helpers for each gap (string vs token, whitespace rules, case preservation, dot-whitespace tolerance)
- [x] Build state transition helpers (lesson status: Locked, Available, Needs check, Complete; unlock progression; edit invalidation)
- [x] Build localStorage persistence with schema version `atft.iteration001.progress.v1`, validation, and graceful reset on incompatible data
- [x] Render IDE-style shell: lesson navigation sidebar, instruction/example area, read-only code with embedded gap inputs, feedback/result area
- [x] Implement lesson 1 (Understand the API): display fixtures, simulation label, Continue marks complete and unlocks lesson 2
- [x] Implement lesson 2 (Describe the behavior): Feature/Scenario with editable Gherkin gaps (feature.given, feature.patient, feature.when, feature.then, feature.status)
- [x] Implement lesson 3 (Model the data): Immunization.cs with editable C# model gaps (model.vaccine, model.patient, model.date)
- [x] Implement lesson 4 (Build the request): RecordVaccinationSteps.cs Given/When gaps (request.status, request.patient, request.method, request.endpoint, request.media)
- [x] Implement lesson 5 (Verify the response): RecordVaccinationSteps.cs Then/And gaps (response.status, response.model, response.patient, response.lot)
- [x] Implement Check my work: evaluate all gaps in current lesson, inline errors with summary, focus first invalid, enable Continue on pass
- [x] Implement Show solution panel per lesson displaying correct learner code without mutating inputs or marking complete
- [x] Implement worked example panel with alternate fixture values in every coding lesson
- [x] Implement Run simulated test (lesson 5): revalidate all lessons, display assembled files, fixed HTTP exchange, four simulated pass rows, learning recap
- [x] Implement Start over with confirmation dialog, clearing only the tutorial storage key and resetting to lesson 1
- [x] Write README documenting install/build commands, simulation limits, local storage behavior, and supported Node version
- [x] Unit-test: fixture/template consistency
- [x] Unit-test: validator cases
- [x] Unit-test: progression/invalidation transitions and corrupted storage recovery
- [x] Browser-test (Playwright): happy path, wrong-answer correction, solution reveal without mutation, refresh/resume, earlier-answer edit invalidation, reset cancel/confirm, console errors, unexpected network requests
- [x] Verify production build succeeds and all tests pass
  - [x] Replace hardcoded 32 KiB threshold with named constant in Program.cs
  - [x] Extract prompt temp-file logic into a testable helper
  - [x] Add assertion that prompts at or below boundary bypass temp-file path
- [x] Verify no real code execution, no real API requests, no HTML interpretation of learner inputs, full keyboard operability, and accessibility requirements
