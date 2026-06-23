import {
  MUTATING_BASH_PATTERNS,
  SAFE_BASH_PATTERNS,
} from "../shared/constants.ts";

const COMMAND_SEPARATORS = /;|&&|\|\|/;
const COMMAND_SUBSTITUTION = /`|\$\((?!\()/;

function isSegmentSafe(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  if (MUTATING_BASH_PATTERNS.some((p) => p.test(trimmed))) return false;
  return SAFE_BASH_PATTERNS.some((p) => p.test(trimmed));
}

export function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Block command chaining and substitution
  if (COMMAND_SEPARATORS.test(trimmed)) return false;
  if (COMMAND_SUBSTITUTION.test(trimmed)) return false;

  // For pipes: validate each segment independently
  const segments = trimmed.split("|");
  return segments.every((s) => isSegmentSafe(s));
}
