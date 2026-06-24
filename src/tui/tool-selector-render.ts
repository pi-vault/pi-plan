import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  getVisibleTools,
  isAlwaysOn,
  type ToolSelectorItem,
  type ToolSelectorState,
  toolPolicyLabel,
  totalPages,
} from "./tool-selector-state.ts";

export interface ToolSelectorTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
}

const LABEL_COLUMN_WIDTH = 24;
const LAYOUT_GAP = "  ";
const MIN_POLICY_WIDTH = 12;

const HELP_BASE =
  "Toggle: Space  \u2022  Navigate: \u2191/\u2193  \u2022  Page: \u2190/\u2192  \u2022  Save: Enter  \u2022  Cancel: Esc";
const HELP_SEARCHING =
  "Toggle: Space  \u2022  Navigate: \u2191/\u2193  \u2022  Cursor: \u2190/\u2192  \u2022  Save: Enter  \u2022  Cancel: Esc";
const SUBTITLE = "Non-built-in tools run at user risk.";
const SEARCH_PLACEHOLDER = "Type to search";

function policyColor(tool: ToolSelectorItem): string {
  const label = toolPolicyLabel(tool);
  if (label === "built-in blocked") return "error";
  if (label === "built-in limited") return "warning";
  if (label.startsWith("user risk")) return "warning";
  return "dim";
}

function renderToolRow(
  tool: ToolSelectorItem,
  selected: boolean,
  focused: boolean,
  theme: ToolSelectorTheme,
  width: number,
): string {
  if (width < 1) return "";

  const isChecked = selected || isAlwaysOn(tool);
  const checkboxRaw = isChecked ? "[\u2022]" : "[ ]";
  const markerRaw = focused ? "\u25B8" : " ";
  const marker = focused ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${checkboxRaw} `;
  const prefixWidth = visibleWidth(prefixRaw);

  const policy = toolPolicyLabel(tool);
  const policyStyled = theme.fg(policyColor(tool), policy);
  const policyWidth = visibleWidth(policy);

  const checkbox = focused ? theme.fg("accent", theme.bold(checkboxRaw)) : checkboxRaw;
  const alignedMinWidth = prefixWidth + LABEL_COLUMN_WIDTH + LAYOUT_GAP.length + MIN_POLICY_WIDTH;

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(tool.name, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const label = focused ? theme.fg("accent", theme.bold(labelPadded)) : labelPadded;
    const policyFitted = truncateToWidth(
      policyStyled,
      Math.max(1, width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length),
    );
    return `${marker} ${checkbox} ${label}${LAYOUT_GAP}${policyFitted}`;
  }

  const remaining = Math.max(0, width - prefixWidth - policyWidth - 2);
  const nameText = truncateToWidth(tool.name, Math.max(1, remaining));
  const label = focused ? theme.fg("accent", theme.bold(nameText)) : nameText;
  return truncateToWidth(`${marker} ${checkbox} ${label}  ${policyStyled}`, width);
}

export function renderToolSelector(
  state: ToolSelectorState,
  theme: ToolSelectorTheme,
  width: number,
): string[] {
  const lines: string[] = [];
  const pages = totalPages(state);
  const pageLabel = pages > 1 && !state.query ? ` (${state.page + 1}/${pages})` : "";
  const title = `Configure Plan-mode tools${pageLabel}`;

  lines.push(truncateToWidth(theme.fg("accent", theme.bold(title)), width));
  lines.push(truncateToWidth(theme.dim(SUBTITLE), width));
  lines.push("");
  lines.push(truncateToWidth(theme.dim(SEARCH_PLACEHOLDER), width));
  lines.push(truncateToWidth(`\u25B8 ${state.query}`, width));

  const visible = getVisibleTools(state);
  for (let i = 0; i < visible.length; i++) {
    const tool = visible[i];
    const focused = i === state.cursorIndex;
    const selected = state.selectedNames.has(tool.name);
    lines.push(renderToolRow(tool, selected, focused, theme, width));
  }

  if (visible.length === 0 && state.query) {
    lines.push(truncateToWidth(theme.dim("No tools match the search."), width));
  }

  lines.push("");
  lines.push(truncateToWidth(theme.dim(state.query ? HELP_SEARCHING : HELP_BASE), width));

  return lines;
}
