/**
 * The single frame-level movement boundary. Callers supply a World and the
 * elapsed frame time; player, movable-item, and creature phases remain
 * implementation details.
 */
export { MovementSystemService } from "./internal/movement-runtime";
