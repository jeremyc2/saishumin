# Movement

Movement advances a World by one elapsed frame through the compact
`MovementSystemService.update` interface. Player control, movable-item physics,
and lava-monster pursuit remain internal phases so callers never coordinate them.

The lava monster owns its pursuit, recovery, jump, and facing decisions in one
private module. Its deterministic grid navigation is private to that behavior.

The colocated tests assert observable World positions and elevations.

Movement may depend on World spatial facts and application control vocabulary;
it does not own input dispatch, Design Studio transitions, or rendering.
