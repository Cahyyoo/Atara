/**
 * Testing Library's async budget, raised to match the test budget.
 *
 * `testTimeout` in vitest.config.mts governs the test; it does not govern
 * `findBy*`, which carries its own 1000ms and fails the assertion rather than
 * the clock. So a test could sit well inside a 20s budget and still be told
 * "unable to find role", which reads as a broken component rather than a slow
 * machine — and that is exactly how bulk-entry's paste test failed roughly one
 * run in three while passing every time in isolation.
 *
 * Raising this does not make a genuinely missing element pass. It only stops a
 * jsdom render that took 1.2s under twenty-way worker contention from being
 * reported as absent.
 */
import { configure } from "@testing-library/dom";

configure({ asyncUtilTimeout: 5000 });
