# Rendering

Rendering observes a World and Design Studio presentation. The Effect-managed
`RenderSystem` owns DOM rendering and directly acquires the scoped Design Studio
interaction inside its `Layer.effect`. Shared geometry and artwork live in the
lower-level presentation module.

Rendering may depend on World, Design Studio presentation, and presentation
primitives, but it does not own gameplay or editor domain transitions. Its
tests are colocated in `rendering/internal/__tests__/`.
