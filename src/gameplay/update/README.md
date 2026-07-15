# Gameplay update

`UpdateSystemService.update(world, action)` is the gameplay update boundary.
It coordinates input, frame ticks, and delegation of Design Studio Actions
without exposing its private control and interaction decisions.

It may depend on World, movement, Design Studio's transition interface, and
rendering geometry for camera projection. Its observable World-outcome tests
are colocated in `update/__tests__/`.
