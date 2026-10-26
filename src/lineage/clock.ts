import type { LiveDevelopmentContext } from "./types";

const DAYS = [0, 10, 30, 75, 120];

/** Piecewise linear maturation; all arguments outside this adapter retain real days. */
export function createDevelopmentClock(context?: LiveDevelopmentContext) {
  const ends = context?.stageEndHours;
  if (!ends)
    return {
      toMorphology: (days: number) => days,
      toChronological: (days: number) => days,
    };
  if (
    ends.length !== 4 ||
    ends.some(
      (hour, i) => !Number.isFinite(hour) || hour <= (i ? ends[i - 1] : 0),
    )
  )
    throw new Error(
      "Live developmental stage ends must be four increasing positive hours.",
    );
  const hours = [0, ...ends];
  return {
    toMorphology(days: number): number {
      const hour = Math.max(0, days * 24);
      for (let i = 1; i < hours.length; i++)
        if (hour <= hours[i])
          return (
            DAYS[i - 1] +
            ((DAYS[i] - DAYS[i - 1]) * (hour - hours[i - 1])) /
              (hours[i] - hours[i - 1])
          );
      return 120 + (hour - hours[4]) / 24;
    },
    toChronological(days: number): number {
      const age = Math.max(0, days);
      for (let i = 1; i < DAYS.length; i++)
        if (age <= DAYS[i])
          return (
            (hours[i - 1] +
              ((hours[i] - hours[i - 1]) * (age - DAYS[i - 1])) /
                (DAYS[i] - DAYS[i - 1])) /
            24
          );
      return hours[4] / 24 + age - 120;
    },
  };
}
