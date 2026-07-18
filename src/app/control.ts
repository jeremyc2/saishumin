import { Schema } from "effect";
import type { Direction as WorldDirection } from "../world/world";

export const Control = Schema.Literals([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	" ",
	"Shift",
	"x",
	"b",
]);
export type Control = typeof Control.Type;

export const Controls = {
	Up: "ArrowUp",
	Down: "ArrowDown",
	Left: "ArrowLeft",
	Right: "ArrowRight",
	Jump: " ",
	Grab: "Shift",
	Interact: "x",
	ContextAction: "b",
} as const satisfies Record<string, Control>;

export type Direction = WorldDirection;

export const isControl = Schema.is(Control);

/** Maps keyboard keys to the game's canonical controls. */
export const controlForKey = (key: string): Control | undefined => {
	switch (key) {
		case "w":
		case "W":
			return Controls.Up;
		case "a":
		case "A":
			return Controls.Left;
		case "s":
		case "S":
			return Controls.Down;
		case "d":
		case "D":
			return Controls.Right;
		case "X":
			return Controls.Interact;
		default:
			return isControl(key) ? key : undefined;
	}
};

export const isDirection = (control: Control): control is Direction =>
	control === Controls.Up ||
	control === Controls.Down ||
	control === Controls.Left ||
	control === Controls.Right;
