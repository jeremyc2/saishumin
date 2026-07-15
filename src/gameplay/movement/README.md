# Movement

Movement advances a World by one elapsed frame through the compact
`MovementSystemService.update` interface. Player control, movable-item physics,
and creature movement remain internal phases so callers never coordinate them.

The colocated tests assert observable World positions and elevations.
