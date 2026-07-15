# Gameplay update

`UpdateSystemService.update({ world, action })` is the gameplay update seam. It
coordinates input, frame ticks, and delegation of Design Studio Actions
without exposing its private control and interaction decisions.

It may depend on World, movement, Design Studio's transition interface, and
the application Action vocabulary. Camera presentation is composed by the app,
so gameplay does not depend on rendering. Observable World-outcome tests are
colocated in `update/__tests__/`.
