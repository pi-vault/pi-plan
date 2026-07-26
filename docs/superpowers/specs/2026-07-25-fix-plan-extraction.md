# Fix Plan Extraction When Its Delimiter Is Mentioned Earlier

## Summary

The save system behaved as implemented, but it received corrupted plan state.

The assistant’s introduction mentioned the opening delimiter in inline code before the real plan block. The unanchored regex in `src/core/context.ts` matched that first occurrence and captured everything through the real closing delimiter. This made `latestPlan` begin with `` ` format expected…`` and include the real opening delimiter.

The exact-content save guard in `src/index.ts` then correctly rejected attempts containing only the intended plan body. The final attempt succeeded because it reproduced the malformed captured string exactly. The resulting untracked file confirms this sequence.

The parser predates the save feature; saving exposed the existing extraction bug rather than causing it.

## Key Changes

- **`tests/core/context.test.ts`** — First add a regression test using the observed response structure: an inline-code delimiter mention followed by a real standalone plan block. Verify extraction returns only the intended plan body.
- **`tests/core/context.test.ts`** — Add matching coverage for context stripping: preserve the inline-code mention while removing the real standalone block.
- **`src/core/context.ts`** — Require extraction and stripping delimiters to be the sole non-whitespace text on their lines, matching the format required by the Plan Mode prompt. Preserve case-insensitive matching, trimming, multiline content, and CRLF support.
- Update existing stripping fixtures that use inline delimiters to use the documented standalone block format.
- Leave `src/index.ts` unchanged; its strict content comparison prevented an altered plan from being saved and is not the defect.

## Test Plan

1. Run the new focused regression test before implementation and confirm it fails by returning the introductory fragment.
2. Apply the parser change and run:
   ```bash
   pnpm test -- tests/core/context.test.ts
   ```
3. Run the complete quality suite:
   ```bash
   pnpm check
   ```
4. Manually repeat the original flow: mention the delimiter in inline code before a real plan block, choose **Save plan**, and verify the first write succeeds with only the intended plan body.

## Assumptions

- Standalone delimiter lines are the supported contract because that is the exact format injected by `src/core/prompt.ts`.
- Backward compatibility for inline same-line plan blocks is not required.
- No dependencies, save-validation changes, or documentation changes are needed.
- The current test command could not be run during diagnosis because Plan Mode blocked `pnpm`; the generated save prompt and saved file provided deterministic reproduction evidence.
