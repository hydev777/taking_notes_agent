---
description: Generate or refresh CHANGELOG.md from main commits
---

Run the changelog generator script for this repository and report the result.

Steps:
1. Execute `node scripts/generate-changelog.mjs` in the workspace root.
2. If generation succeeds, summarize how many commits were included and confirm `CHANGELOG.md` was updated.
3. If generation fails, explain the exact error and suggest the next fix.
