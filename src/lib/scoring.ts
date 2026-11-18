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
 * @param maxDuration Maximum round duration in seconds (defaults to ROUND_DURATION_SEC = 20)
 * @returns Number between 0 and 100
 */
export function calculateRoundPoints(
  isCorrect: boolean,
  elapsedSeconds: number,
  maxDuration: number = ROUND_DURATION_SEC
): number {
  if (!isCorrect) return 0;

  // Safe clamp elapsed time
  const elapsed = Math.max(0, elapsedSeconds);

  // Instant reflexes (<= 1.2s) get full 100 points
  if (elapsed <= REFLEX_THRESHOLD_SEC) {
    return MAX_POINTS_PER_ROUND;
  }

  // If time exceeded round duration, 0 points
  if (elapsed >= maxDuration) {
    return 0;
  }

  // Exponential decay between 1.2s and maxDuration
  const availableTimeSpan = Math.max(1, maxDuration - REFLEX_THRESHOLD_SEC);
  const remainingTime = Math.max(0, maxDuration - elapsed);
  const remainingRatio = Math.min(1, Math.max(0, remainingTime / availableTimeSpan));

  // Curve: 10 minimum points on a correct last-second guess, up to 100 points
  const points = Math.round(10 + 90 * Math.pow(remainingRatio, 2.2));
  return Math.max(10, Math.min(MAX_POINTS_PER_ROUND, points));
}

/**
 * Returns round duration in seconds for Infinite Survival mode.
 * - Rounds 1 to 3 (0..2): 18s (Calentamiento)
 * - Rounds 4 to 6 (3..5): 14s (Presión)
 * - Rounds 7 to 9 (6..8): 10s (Peligro)
 * - Round 10 onwards (>= 9): 7s (ZONA ROJA, x1.5 pts)
 */
export function getSurvivalRoundDuration(roundIndex: number): number {
  if (roundIndex < 3) return 18;
  if (roundIndex < 6) return 14;
  if (roundIndex < 9) return 10;
  return 7;
}

export function getSurvivalPhaseInfo(roundIndex: number): {
  phaseName: string;
  duration: number;
  isRedZone: boolean;
  multiplier: number;
} {
  if (roundIndex < 3) return { phaseName: "Calentamiento", duration: 18, isRedZone: false, multiplier: 1.0 };
  if (roundIndex < 6) return { phaseName: "Presión", duration: 14, isRedZone: false, multiplier: 1.0 };
  if (roundIndex < 9) return { phaseName: "Peligro", duration: 10, isRedZone: false, multiplier: 1.0 };
  return { phaseName: "ZONA ROJA", duration: 7, isRedZone: true, multiplier: 1.5 };
}
