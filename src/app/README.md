# Application

The application module composes World persistence, gameplay updates, Design
Studio presentation, and the Effect-managed rendering runtime. `action.ts`
owns the top-level Action vocabulary; `main.ts` owns browser input, animation
frames, HMR startup, and cleanup.

Application code may depend on every application module, while those modules
must not depend on `main.ts`. Its input mapping tests are colocated in
`app/__tests__/`.
