import { describe, expect, it } from "vitest";
import { isSafeCommand } from "../../src/core/safety.ts";

describe("isSafeCommand", () => {
  it("rejects empty input", () => {
    expect(isSafeCommand("")).toBe(false);
    expect(isSafeCommand("  ")).toBe(false);
  });

  describe("safe read-only commands", () => {
    const safe = [
      "cat file.ts",
      "head -20 file.ts",
      "tail -f log.txt",
      "grep -r pattern src/",
      "find . -name '*.ts'",
      "ls -la",
      "pwd",
      "echo hello",
      "wc -l file.ts",
      "sort file.txt",
      "diff a.ts b.ts",
      "tree src/",
      "git status --short",
      "git log --oneline -5",
      "git diff HEAD",
      "git show HEAD:file.ts",
      "git branch -a",
      "npm list --depth=0",
      "npm outdated",
      "sed -n '1,20p' file.ts",
      "jq '.name' package.json",
      "rg pattern src/",
      "fd '*.ts'",
      "node --version",
      "python --version",
    ];

    for (const cmd of safe) {
      it(`allows: ${cmd}`, () => {
        expect(isSafeCommand(cmd)).toBe(true);
      });
    }
  });

  describe("mutating commands", () => {
    const dangerous = [
      "rm -rf build",
      "rm file.ts",
      "mv a.ts b.ts",
      "cp a.ts b.ts",
      "mkdir new-dir",
      "touch file.ts",
      "chmod 755 script.sh",
      "git add .",
      "git commit -m 'msg'",
      "git push origin main",
      "git checkout main",
      "git stash",
      "npm install",
      "npm uninstall pkg",
      "yarn add pkg",
      "pnpm add pkg",
      "bun add pkg",
      "pip install pkg",
      "sudo rm -rf /",
      "kill -9 1234",
      "vim file.ts",
      "nano file.ts",
      "code file.ts",
    ];

    for (const cmd of dangerous) {
      it(`blocks: ${cmd}`, () => {
        expect(isSafeCommand(cmd)).toBe(false);
      });
    }
  });

  describe("redirect operators", () => {
    it("blocks stdout redirect", () => {
      expect(isSafeCommand("echo hello > file.txt")).toBe(false);
    });

    it("blocks append redirect", () => {
      expect(isSafeCommand("echo hello >> file.txt")).toBe(false);
    });

    it("allows comparison operators in safe commands", () => {
      expect(isSafeCommand("echo $((1<2))")).toBe(true);
    });
  });
});
