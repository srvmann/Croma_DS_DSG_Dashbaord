// Classification thresholds — all activity values are cumulative phase totals
// (sum of monthly_sales across the phase's months, which equals policies sold).
// Growth % = (recentTotal - earlyTotal) / earlyTotal × 100
export const CLASSIFICATION_CONFIG = {
  // New Bloomer — store had little/no activity early or mid, now contributing
  NEW_BLOOMER_ACTIVITY_FLOOR:  10,   // recentTotal must be >= this
  NEW_BLOOMER_EARLY_CEILING:   10,   // earlyTotal OR midTotal must be < this

  // Rising Star — established store with strong growth
  RISING_STAR_ACTIVITY_FLOOR:  10,   // earlyTotal must be >= this
  RISING_STAR_GROWTH:          30,   // growth % must be >= this

  // Growing Store — steady improvement (below Rising Star threshold)
  GROWING_STORE_ACTIVITY_FLOOR: 10,  // earlyTotal must be >= this
  GROWING_STORE_MIN_GROWTH:    10,   // growth % >= this (inclusive)
  GROWING_STORE_MAX_GROWTH:    30,   // growth % < this (exclusive → Rising Star)

  // Consistent Performer — stable, no strong trend either way
  CONSISTENT_MIN_GROWTH:      -10,   // growth % >= this (inclusive)
  CONSISTENT_MAX_GROWTH:       10,   // growth % <= this (inclusive)

  // Declining Store — moderate negative trajectory
  DECLINING_MIN_GROWTH:       -30,   // growth % > this (exclusive floor → Fallen Star)
  DECLINING_MAX_GROWTH:       -10,   // growth % < this (exclusive ceiling)

  // Fallen Star — sharp decline from an established base
  FALLEN_STAR_ACTIVITY_FLOOR:  10,   // earlyTotal must be >= this
  FALLEN_STAR_GROWTH:         -30,   // growth % <= this
} as const
