# Gameplay

Gameplay transforms a World for play. `movement/` advances physics and
navigation; `update/` maps application Actions into gameplay or Design Studio
World transitions through its compact `UpdateSystemService.update` interface.

Gameplay may depend on World and the application Action vocabulary, but it
does not own browser lifecycle, persistence, Design Studio implementation, or
rendering. Tests are colocated beside movement and update in their respective
`__tests__/` directories.
