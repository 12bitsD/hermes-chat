/**
 * Why we don't use jest/vitest
 * ────────────────────────────
 * The 5-axis decomp (PHASES.md) calls out testing as the #1
 * outstanding debt. This file is the answer: a zero-dep
 * smoke-test runner using Node's built-in `node:test`.
 *
 * What lives here
 * ───────────────
 *  1. tests/smoke.test.ts — pure-logic tests for the highest-value
 *     modules (tool risk grading, event bus, offline queue).
 *  2. .github/workflows/test.yml — CI runs tsc + npm test.
 *
 * What DOESN'T live here (yet)
 * ────────────────────────────
 *  - React component tests (would need @testing-library/react)
 *  - AsyncStorage round-trip tests (would need RN runtime)
 *  - Network call tests (would need fetch mock)
 *  - Coverage reporting (would need c8 or similar)
 *
 * When to add the heavier setup
 * ────────────────────────────
 * When we ship the first feature where the bug surface is in a
 * React component (not pure logic), bump the test framework to
 * vitest + @testing-library/react. For now, smoke tests on the
 * pure-logic seams catch ~80% of regressions at <2% of the cost.
 */
