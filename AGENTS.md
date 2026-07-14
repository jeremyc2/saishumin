- Avoid using regex where possible. Add a comment above each non-trivial regex breaking it down.
- Reference the git submodules in `reference_repositories` for best practices, usage examples, and documentation for the frameworks and packages we use.
- NEVER loosen `diagnosticSeverity` rules in `tsconfig.json`.
- When you need to run the dev server, use `bun dev:ai` instead of `bun dev` to avoid port conflicts.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. See `docs/agents/domain.md`.
