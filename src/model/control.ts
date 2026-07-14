import { Schema } from "effect";

export const Control = Schema.Literals([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	" ",
	"Shift",
	"x",
]);
export type Control = typeof Control.Type;

export const Controls = {
	Up: Control.make("ArrowUp"),
	Down: Control.make("ArrowDown"),
	Left: Control.make("ArrowLeft"),
	Right: Control.make("ArrowRight"),
	Jump: Control.make(" "),
	Grab: Control.make("Shift"),
	Interact: Control.make("x"),
} as const;

export type Direction =
	| typeof Controls.Up
	| typeof Controls.Down
	| typeof Controls.Left
	| typeof Controls.Right;

export const isControl = Schema.is(Control);

export const isDirection = (control: Control): control is Direction =>
	control === Controls.Up ||
	control === Controls.Down ||
	control === Controls.Left ||
	control === Controls.Right;
