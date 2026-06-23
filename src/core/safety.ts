import {
  MUTATING_BASH_PATTERNS,
  SAFE_BASH_PATTERNS,
} from "../shared/constants.ts";

export function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (MUTATING_BASH_PATTERNS.some((p) => p.test(trimmed))) return false;
  return SAFE_BASH_PATTERNS.some((p) => p.test(trimmed));
}
