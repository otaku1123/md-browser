// How many entries opening a folder may visit (viewer only). Every entry is a file system call,
// so the cap keeps a typo from scanning a huge tree for minutes.
import { createSettingsStore, type SettingsStore } from './settings-store';

export const SCAN_LIMIT_DEFAULT = 5000;
export const SCAN_LIMIT_MIN = 100;
export const SCAN_LIMIT_MAX = 100_000;

/** Unset or not a number: the default. Out of range: clamped. */
export function normalizeScanLimit(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return SCAN_LIMIT_DEFAULT;
  return Math.min(SCAN_LIMIT_MAX, Math.max(SCAN_LIMIT_MIN, Math.round(n)));
}

let store: SettingsStore<number> | undefined;

export function scanLimitStore(): SettingsStore<number> {
  return (store ??= createSettingsStore('md-browser:scan-limit', normalizeScanLimit));
}
