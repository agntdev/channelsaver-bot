/** Single clock seam for audit timestamps, retention, and throttling. */
let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

/** Test-only clock override. Application code always calls now(). */
export function setClockForTests(next?: () => Date): void {
  clock = next ?? (() => new Date());
}
