/**
 * How much slower than an empty road a trip starting at `at` usually is.
 *
 * The free routing service has no live traffic, so this is a rough rule of
 * thumb for Malaysian city driving, not real traffic data: weekday morning
 * and evening rush, and Friday afternoon prayers. Once a trip is under way,
 * the app also corrects the ETA using how fast you're actually going.
 */
export function rushHourFactor(at: Date): number {
  const day = at.getDay(); // 0 = Sunday
  const hour = at.getHours() + at.getMinutes() / 60;
  const weekday = day >= 1 && day <= 5;
  if (!weekday) return 1;
  if (hour >= 7 && hour < 9.5) return 1.35;
  if (hour >= 17 && hour < 20) return 1.45;
  if (day === 5 && hour >= 12.5 && hour < 14.5) return 1.2;
  return 1;
}
