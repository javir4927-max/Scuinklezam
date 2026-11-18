/**
 * Scoring and Timing constants and utilities for Scuinklezam.
 *
 * Rules:
 * - Round duration: 20 seconds (ROUND_DURATION_SEC = 20).
 * - Reveal pause between rounds: 4.5 seconds (REVEAL_DURATION_MS = 4500).
 * - Maximum score per round: 100 points.
 * - Maximum score in a 10-round match: 1000 points.
 * - Exponential decay curve:
 *   - Incorrect or timeout: 0 pts.
 *   - Correct <= 1.2s: 100 pts.
 *   - Correct between 1.2s and 20s: 10 to 100 pts following Math.pow(remainingRatio, 2.2).
 */

export const ROUND_DURATION_SEC = 20;
export const REVEAL_DURATION_MS = 4500;
export const REVEAL_DURATION_SEC = 4.5;
export const MAX_POINTS_PER_ROUND = 100;
export const REFLEX_THRESHOLD_SEC = 1.2;

/**
 * Calculates exponential points for a round.
 *
 * @param isCorrect Whether player chose the right track
 * @param elapsedSeconds Seconds elapsed from audio start to answer submission
 * @returns Number between 0 and 100
 */
export function calculateRoundPoints(isCorrect: boolean, elapsedSeconds: number): number {
  if (!isCorrect) return 0;

  // Safe clamp elapsed time
  const elapsed = Math.max(0, elapsedSeconds);

  // Instant reflexes (<= 1.2s) get full 100 points
  if (elapsed <= REFLEX_THRESHOLD_SEC) {
    return MAX_POINTS_PER_ROUND;
  }

  // If time exceeded round duration, 0 points
  if (elapsed >= ROUND_DURATION_SEC) {
    return 0;
  }

  // Exponential decay between 1.2s and 20.0s (span of 18.8s)
  const availableTimeSpan = ROUND_DURATION_SEC - REFLEX_THRESHOLD_SEC; // 18.8s
  const remainingTime = Math.max(0, ROUND_DURATION_SEC - elapsed);
  const remainingRatio = Math.min(1, Math.max(0, remainingTime / availableTimeSpan));

  // Curve: 10 minimum points on a correct last-second guess, up to 100 points
  const points = Math.round(10 + 90 * Math.pow(remainingRatio, 2.2));
  return Math.max(10, Math.min(MAX_POINTS_PER_ROUND, points));
}
