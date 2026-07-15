# World

The World module owns the complete in-memory runtime snapshot: the current
Authored Room, ECS entity identity and component data, authored floor data, and
transient gameplay and Design Studio state. Saishumin still starts with exactly
one Authored Room; this module does not define Authored Room identifiers,
selection, or transitions.

## Interface and implementation

- `world.ts` defines the World shape and stable runtime constants.
- `components.ts` and `entity-id.ts` own ECS data definitions and identity.
- `editor-state.ts` owns the transient editor-state contract stored in a World;
  the Design Studio owns transitions for that contract.
- `floor.ts` owns authored floor terrain data and expansion rules.
- `initial-world.ts` constructs the current single-Authored-Room World snapshot.
- `reconcile-world.ts` repairs invalid game state while retaining valid authored
  content, regardless of whether the state came from HMR, disk, or another
  persistence boundary.
- `spatial/` owns collision, elevation, and support-surface facts shared by
  gameplay, the Design Studio, and rendering. Its colocated `__tests__/`
  directories cover spatial facts; `world/__tests__/` covers initial and invalid
  state reconciliation snapshots.

Callers import the specific interface they need; there is intentionally no
barrel or forwarding module. World code does not import gameplay, Design Studio,
or rendering behavior. Those modules may transform or observe a World through
these interfaces, while application composition owns loading, storing, and
reconciling World snapshots. HMR is the current persistence boundary, but it is
not part of the World module's contract.
