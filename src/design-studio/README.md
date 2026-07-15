# Design Studio

The Design Studio authors the World’s Authored Room. Its Edit Session module
keeps a transient preview separate from committed room state until it is
validated and committed.

`design-studio.ts` exposes the compact World transition interface used by the
application update loop. `edit-session/` owns preview, validity, commit, and
cancel rules; `interaction/` owns pointer-driven gestures and their scoped
browser-listener lifecycle; `view/` owns Design Studio presentation. The module
may depend on World and presentation geometry or artwork, but it does not own
gameplay or rendering lifecycle transitions.

Tests are colocated in `__tests__/` at the Design Studio, Edit Session,
interaction, and view seams. An Edit Session is transient: previews never
mutate the Authored Room until a valid commit.
