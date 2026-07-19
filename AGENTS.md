- Avoid using regex where possible. Add a comment above each non-trivial regex breaking it down.
- Reference the git submodules in `reference_repositories` for best practices, usage examples, and documentation for the frameworks and packages we use.
- NEVER loosen `diagnosticSeverity` rules in `tsconfig.json`.
- When you need to run the dev server, use `bun dev:ai` instead of `bun dev` to avoid port conflicts.
- Keep tests colocated with the module they exercise in that module's `__tests__/` directory. Use multiple `__tests__/` directories; do not centralize the test suite.
- Preserve idiomatic Effect control flow and typed error handling. Prefer Effect primitives over project-specific wrappers that hide or remap errors, requirements, dependency provision, or cleanup.
- Treat a module as an interface plus its implementation, not as a single file. Split large implementations into private files without unnecessarily widening the module's interface.
- For exported functions with multiple inputs, use `dual` only when there is a meaningful primary data value and a real pipeline use case. Otherwise accept one object with named fields; keep implementation-only functions unexported whenever the module seam allows it.
- Do not introduce an Effect `Context.Service` merely to reduce file size. Add one when it represents a meaningful contextual dependency, lifecycle, or substitutable implementation.
- Do not use nested ternary operators.
- Never use `_tag` directly. Every Effect module (e.g. Match, Data, Predicate, Schema, Stream, Request, etc. modules) has `Tagged`/`Tag` variants you can import. That means you will never have to access that property, create/update it, or pattern match on it directly. That's why it is prefixed with an underscore: it is private to the Effect implementation.
- Use Tailwind instead of writing your own CSS.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. See `docs/agents/domain.md`.
