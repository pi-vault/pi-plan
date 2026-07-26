const COMMAND_SEPARATORS = /;|&&|\|\|/;
const COMMAND_SUBSTITUTION = /`|\$\((?!\()/;

const MUTATING_BASH_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish|version)\b/i,
  /\byarn\s+(add|remove|install|publish|upgrade)\b/i,
  /\bpnpm\s+(add|remove|install|publish|update)\b/i,
  /\bbun\s+(add|remove|install|update|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\buv\s+(add|remove|sync|lock|pip\s+install)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|stash|cherry-pick|revert|tag|init|clone|apply|am|bisect)\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
  /\bservice\s+\S+\s+(start|stop|restart)\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_BASH_PATTERNS: RegExp[] = [
  /^\s*(cat|head|tail|less|more|grep|find|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|uptime|ps|jq|awk|rg|fd|bat|eza)\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-files|grep)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*(node|python|python3|npm|tsc|biome|ruff|ty)\s+--version\b/i,
];

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
