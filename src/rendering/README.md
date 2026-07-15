# Rendering

Rendering observes a World and Design Studio presentation state. The
Effect-managed `RenderSystem` owns DOM rendering, listeners, animation-facing
acquisition, interruption, and cleanup; `geometry/` and `artwork/` provide
pure projection and visual construction interfaces.

Rendering may depend on World and Design Studio presentation interfaces, but
does not own their domain transitions. Tests are colocated in the relevant
`__tests__/` directories below rendering.
