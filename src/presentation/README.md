# Presentation

Presentation contains the pure visual primitives shared by Design Studio views
and rendering. `geometry/` owns projection, framing, resize, and depth math;
`artwork/` owns lit-html SVG templates and deterministic terrain preparation.

Presentation observes World data but owns no DOM lifecycle, gameplay transition,
or Design Studio transition. Its tests are colocated in the `__tests__/`
directories below `geometry/` and `artwork/`.
