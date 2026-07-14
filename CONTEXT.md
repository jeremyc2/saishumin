# Saishumin

Saishumin is a room-exploration game with an integrated Design Studio for authoring the playable room.

## Language

**Editor Item**:
An object that can be created and modified in the Design Studio, such as a rug, plant, lamp, wall, platform, crate, chest, or sign. The player and floor are not Editor Items.
_Avoid_: Editor object, palette object

**Design Studio Panel**:
The right sidebar containing the Design Studio's authoring controls.
_Avoid_: Sidebar, design panel

**Object Palette**:
The Design Studio Panel section from which new Editor Items are dragged into the room.
_Avoid_: Add objects panel, item list

**Edit Session**:
A transient Design Studio gesture from its initial authored state through preview to either commit or cancel. At most one may be active; it is never persisted, its preview remains separate from the authored room until commit, and cancellation discards it.
_Avoid_: Transaction, editor interaction

**Invalid Preview**:
An Edit Session preview that cannot be committed to the authored room. It remains visible until dismissed, while the authored room remains unchanged.
_Avoid_: Invalid placement state, rolled-back edit
