import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export async function savePlanToFile(
  plan: string,
  ctx: ExtensionContext,
): Promise<void> {
  if (!ctx.hasUI) return;
  const input = await ctx.ui.input("Save plan to:", "proposed-plan.md");
  const path = input?.trim();
  if (!path) return;

  const filePath = isAbsolute(path) ? path : resolve(ctx.cwd, path);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, plan, "utf-8");
    ctx.ui.notify(`Plan saved to ${filePath}`, "info");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to save plan: ${message}`, "warning");
  }
}
