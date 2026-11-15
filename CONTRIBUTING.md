# Contributing

Use a feature branch and keep changes focused on a user-visible behavior or a documented maintenance objective. The active app is in `src/server` and `public`; the `legacy` directory is archival.

1. Install Node.js 22.9+ and configure a private root `.env` if live testing is needed.
2. Make the change and add meaningful tests for planning, validation, and failure handling.
3. Run `npm run check`, `npm test`, and `git diff --check`.
4. Test affected user flows manually in the local preview. Document browser checks that were not available.
5. Update relevant docs for behavior/configuration/API changes. Write a commit message that states the resulting behavior.

Use two-space indentation, LF endings, descriptive names, and small modules. Do not log or commit API credentials or personal locations. Do not place generated caches, dependency folders, reports of live user trips, or downloaded runtime binaries under version control. Preserve attribution for bundled vendor assets.

Pull requests should explain the problem, resulting behavior, verification performed, and material limitations. Do not describe local-only checks as a successful hosted deployment or remote CI run.
