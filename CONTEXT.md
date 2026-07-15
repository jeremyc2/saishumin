# Saishumin

Saishumin is a room-exploration game with an integrated Design Studio for authoring the playable room.

## Language

**World**:
The complete runtime snapshot of the game, including every Authored Room and all transient gameplay and Design Studio state. A World may contain one or more Authored Rooms.
_Avoid_: Room, level

**Authored Room**:
The committed room state within a World, including its floor and Editor Items. It excludes transient gameplay state and any uncommitted Edit Session preview.
_Avoid_: World, level

**Editor Item**:
An object that can be created and modified in the Design Studio, such as hopscotch, plant, lamp, wall, platform, crate, chest, or sign. The player and floor are not Editor Items.
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

**Edit Session Status**:
The mutually exclusive condition of an Edit Session: inactive, active, showing an Invalid Preview, or awaiting dismissal after an invalid release.
_Avoid_: Edit Session Presentation, editor status

**Invalid Preview**:
An Edit Session preview that cannot be committed to the authored room. It remains visible until dismissed, while the authored room remains unchanged.
_Avoid_: Invalid placement state, rolled-back edit
