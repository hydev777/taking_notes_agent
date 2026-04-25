---
description: Generate a versioned changelog and bump app patch version
---

Run the versioned changelog generator script for this repository and report the result.

Steps:
1. Execute `node scripts/generate-changelog.mjs` in the workspace root.
2. If generation succeeds, report:
   - previous and new app version from `package.json`,
   - that `CHANGELOG.md` was updated,
   - and that the newest block follows `## [vX.Y.Z] - YYYY-MM-DD` with `Summary` and categorized sections.
3. If generation fails, explain the exact error and suggest the next fix.
