# ATFT — API Test Framework Tutorial

An IDE-style web tutorial for learning API test automation with C#, Reqnroll, and FHIR.

## Requirements

- Node.js >= 22.0.0
- npm >= 10.0.0

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production build

```bash
npm run build
```

## Preview production build

```bash
npm run preview
```

## Tests

### Unit tests (Vitest)

```bash
npm test
```

### Browser tests (Playwright)

```bash
npm run test:e2e
```

## Simulation limits

This tutorial simulates test scenarios in the browser. It does **not** compile or execute learner-authored C# code, and it does **not** send real HTTP requests to the illustrative FHIR endpoint.

## Tracing

During coding lessons 2–5, optional **Trace this step** buttons appear beside the relevant code concepts. Opening a trace displays an inline panel that walks through how a Gherkin step connects to its Reqnroll binding, how values flow into the request, and how assertions verify the response. Tracing is optional and does not change your answers or submit checks.

After completing all lessons and passing the simulated test, an optional **Walk through my test** review traces your completed code through the same concepts using your own answers.

## Understanding checks

Lessons 2–5 each include one or more multiple-choice understanding checks. You must pass both the code exercise and all assigned understanding checks in a lesson before unlocking the next lesson. Incorrect answers show choice-specific feedback and can be retried without penalty. Selecting an answer alone does not pass the check—you must submit it with **Check understanding**.

## Progress and migration

Progress (lesson completion, gap answers, check states, and understanding selections) is saved to the browser's `localStorage` so it survives refresh. If storage is unavailable or full, the session continues in memory with a visible warning. Use **Start over** in the app to clear saved progress.

When the tutorial is updated, existing progress is migrated automatically. Your gap answers, valid code checks, and unlocked lessons are preserved. New understanding checks are introduced as unanswered, and overall completion is cleared until the new checks are passed.
