import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

interface RegisteredFlag {
  description?: string;
  type: string;
  default?: boolean | string;
}

interface RegisteredCommand {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => unknown;
}

type EventHandler = (
  event: unknown,
  ctx: ExtensionContext,
) => Promise<unknown> | unknown;

export interface ToolInfoLike {
  name: string;
  description?: string;
  sourceInfo: { source: string };
}

export interface MockPi {
  pi: ExtensionAPI;
  flags: Map<string, RegisteredFlag>;
  flagValues: Map<string, boolean | string>;
  commands: Map<string, RegisteredCommand>;
  events: Map<string, EventHandler[]>;
  activeTools: string[];
  allTools: ToolInfoLike[];
  entries: Array<{ customType: string; data: unknown }>;
  messages: Array<{ message: unknown; options: unknown }>;
  userMessages: Array<{ content: unknown; options: unknown }>;
  fireEvent(name: string, event: unknown, ctx: MockContext): Promise<unknown>;
}

export interface MockContext {
  ctx: ExtensionCommandContext;
  statuses: Map<string, string | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  widgets: Map<string, unknown>;
  selectCalls: Array<{ title: string; options: string[] }>;
}

export function createMockPi(options?: {
  activeTools?: string[];
  allTools?: ToolInfoLike[];
}): MockPi {
  const flags = new Map<string, RegisteredFlag>();
  const flagValues = new Map<string, boolean | string>();
  const commands = new Map<string, RegisteredCommand>();
  const events = new Map<string, EventHandler[]>();
  let activeTools = options?.activeTools ?? ["read", "bash", "edit", "write"];
  const allTools: ToolInfoLike[] = options?.allTools ?? [];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const messages: Array<{ message: unknown; options: unknown }> = [];
  const userMessages: Array<{ content: unknown; options: unknown }> = [];

  const mock: MockPi = {
    pi: {
      registerFlag(name: string, opts: RegisteredFlag) {
        flags.set(name, opts);
        if (opts.default !== undefined && !flagValues.has(name)) {
          flagValues.set(name, opts.default);
        }
      },
      registerCommand(name: string, opts: RegisteredCommand) {
        commands.set(name, opts);
      },
      on(event: string, handler: EventHandler) {
        const handlers = events.get(event) ?? [];
        handlers.push(handler);
        events.set(event, handlers);
      },
      getFlag(name: string) {
        return flagValues.get(name);
      },
      getActiveTools() {
        return [...activeTools];
      },
      setActiveTools(toolNames: string[]) {
        activeTools = [...toolNames];
        mock.activeTools = activeTools;
      },
      appendEntry(customType: string, data: unknown) {
        entries.push({ customType, data });
      },
      sendMessage(message: unknown, opts: unknown) {
        messages.push({ message, options: opts });
      },
      sendUserMessage(content: unknown, opts: unknown) {
        userMessages.push({ content, options: opts });
      },
      getAllTools() {
        return [...allTools];
      },
    } as unknown as ExtensionAPI,
    flags,
    flagValues,
    commands,
    events,
    activeTools,
    allTools,
    entries,
    messages,
    userMessages,
    async fireEvent(name: string, event: unknown, mockCtx: MockContext) {
      const handlers = events.get(name) ?? [];
      let result: unknown;
      for (const handler of handlers) {
        result = await handler(event, mockCtx.ctx);
      }
      return result;
    },
  };

  return mock;
}

export function createMockContext(options?: {
  entries?: SessionEntry[];
  hasUI?: boolean;
  isIdle?: boolean;
  selectResponses?: string[];
}): MockContext {
  const statuses = new Map<string, string | undefined>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const widgets = new Map<string, unknown>();
  const selectCalls: Array<{ title: string; options: string[] }> = [];
  const selectQueue = [...(options?.selectResponses ?? [])];
  const sessionEntries: SessionEntry[] = options?.entries ?? [];

  const mockCtx: MockContext = {
    ctx: {
      ui: {
        setStatus(key: string, value: string | undefined) {
          statuses.set(key, value);
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        setWidget(key: string, content: unknown) {
          if (content === undefined) {
            widgets.delete(key);
          } else {
            widgets.set(key, content);
          }
        },
        async select(title: string, options: string[]) {
          selectCalls.push({ title, options });
          return selectQueue.shift();
        },
        theme: {
          fg(_color: string, text: string) {
            return text;
          },
        },
      },
      hasUI: options?.hasUI ?? true,
      isIdle: () => options?.isIdle ?? true,
      sessionManager: {
        getEntries: () => sessionEntries,
      },
    } as unknown as ExtensionCommandContext,
    statuses,
    notifications,
    widgets,
    selectCalls,
  };

  return mockCtx;
}
