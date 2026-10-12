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

## Local storage

Progress (lesson completion, gap answers, and check states) is saved to the browser's `localStorage` so it survives refresh. If storage is unavailable or full, the session continues in memory with a visible warning. Use **Start over** in the app to clear saved progress.
