import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILENAME = "extensions/plan-tools.json";

export function getConfigFilePath(): string {
  return join(getAgentDir(), CONFIG_FILENAME);
}

export async function readToolConfig(): Promise<Record<string, boolean> | undefined> {
  const filePath = getConfigFilePath();

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const config: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as object)) {
      if (typeof value === "boolean") {
        config[key] = value;
      }
    }
    return Object.keys(config).length > 0 ? config : undefined;
  } catch {
    return undefined;
  }
}

export async function writeToolConfig(config: Record<string, boolean>): Promise<void> {
  const filePath = getConfigFilePath();

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Silently fail — non-critical persistence
  }
}
