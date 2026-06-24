import { type Component, Key, matchesKey } from "@earendil-works/pi-tui";
import { renderToolSelector, type ToolSelectorTheme } from "./tool-selector-render.ts";
import {
  initToolSelectorState,
  type ToolSelectorItem,
  type ToolSelectorState,
  toolSelectorReducer,
} from "./tool-selector-state.ts";

export type { ToolSelectorTheme } from "./tool-selector-render.ts";
export type { ToolSelectorItem } from "./tool-selector-state.ts";

export function createToolSelectorComponent(options: {
  tools: ToolSelectorItem[];
  previousSelections: string[] | undefined;
  theme: ToolSelectorTheme;
  done: (result: string[] | null) => void;
  requestRender: () => void;
}): Component {
  let state: ToolSelectorState = initToolSelectorState(options.tools, options.previousSelections);

  function dispatch(action: Parameters<typeof toolSelectorReducer>[1]): void {
    const result = toolSelectorReducer(state, action);
    if (result.type === "done") {
      options.done(result.selections);
    } else if (result.state !== state) {
      state = result.state;
      options.requestRender();
    }
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) return void dispatch({ type: "cancel" });
      if (matchesKey(data, Key.enter)) return void dispatch({ type: "save" });
      if (matchesKey(data, Key.up)) return void dispatch({ type: "move_up" });
      if (matchesKey(data, Key.down)) return void dispatch({ type: "move_down" });
      if (matchesKey(data, Key.space)) return void dispatch({ type: "toggle" });
      if (matchesKey(data, Key.left)) {
        if (state.query) return void dispatch({ type: "cursor_left" });
        return void dispatch({ type: "prev_page" });
      }
      if (matchesKey(data, Key.right)) {
        if (state.query) return void dispatch({ type: "cursor_right" });
        return void dispatch({ type: "next_page" });
      }
      if (matchesKey(data, Key.backspace)) return void dispatch({ type: "backspace" });
      if (/^[\x20-\x7E]$/.test(data) && !matchesKey(data, Key.space))
        return void dispatch({ type: "type_char", char: data });
    },
    render(width: number): string[] {
      return renderToolSelector(state, options.theme, width);
    },
  };
}
