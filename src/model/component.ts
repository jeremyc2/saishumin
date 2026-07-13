import { Schema } from "effect";

export const Position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });
export type Position = typeof Position.Type;

const PositiveFinite = Schema.Finite.check(Schema.isGreaterThan(0));
export const Body = Schema.Struct({
	width: PositiveFinite,
	depth: PositiveFinite,
});
export type Body = typeof Body.Type;

export const Elevation = Schema.Struct({
	z: Schema.Finite,
	velocity: Schema.Finite,
});
export type Elevation = typeof Elevation.Type;

export const ObstacleKind = Schema.Literals(["wall", "crate", "platform"]);
export const ObstacleKinds = {
	Wall: ObstacleKind.make("wall"),
	Crate: ObstacleKind.make("crate"),
	Platform: ObstacleKind.make("platform"),
} as const;

const NonNegativeFinite = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
export const Obstacle = Schema.Struct({
	height: NonNegativeFinite,
	kind: ObstacleKind,
});
export type Obstacle = typeof Obstacle.Type;
