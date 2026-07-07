import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfigFilePath,
  readToolConfig,
  writeToolConfig,
} from "../../src/core/config.ts";

describe("getConfigFilePath", () => {
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns path under PI_CODING_AGENT_DIR when set", () => {
    process.env.PI_CODING_AGENT_DIR = "/home/user/.config/pi";
    expect(getConfigFilePath()).toBe(
      "/home/user/.config/pi/extensions/plan-tools.json",
    );
  });

  it("returns a default path when env var is unset", () => {
    delete process.env.PI_CODING_AGENT_DIR;
    const result = getConfigFilePath();
    expect(result).toMatch(/extensions\/plan-tools\.json$/);
  });
});

describe("readToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns undefined when file does not exist", async () => {
    expect(await readToolConfig()).toBeUndefined();
  });

  it("returns parsed config when file exists", async () => {
    const dir = join(tempDir, "extensions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plan-tools.json"),
      JSON.stringify({ read: true, custom: true, edit: false }),
    );

    const config = await readToolConfig();
    expect(config).toEqual({ read: true, custom: true, edit: false });
  });

  it("returns undefined when file contains invalid JSON", async () => {
    const dir = join(tempDir, "extensions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan-tools.json"), "not json");

    expect(await readToolConfig()).toBeUndefined();
  });

  it("filters out non-boolean values from config", async () => {
    const dir = join(tempDir, "extensions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plan-tools.json"),
      JSON.stringify({ read: true, custom: "yes", edit: false, broken: 42 }),
    );

    const config = await readToolConfig();
    expect(config).toEqual({ read: true, edit: false });
  });
});

describe("writeToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("writes config to the correct path", async () => {
    const config = { read: true, bash: true, custom: true };
    await writeToolConfig(config);

    const configPath = join(tempDir, "extensions", "plan-tools.json");
    expect(existsSync(configPath)).toBe(true);
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content).toEqual(config);
  });
});
