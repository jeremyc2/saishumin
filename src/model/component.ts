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

export const ObstacleKind = Schema.Literals([
	"wall",
	"crate",
	"platform",
	"chest",
]);
export const ObstacleKinds = {
	Wall: ObstacleKind.make("wall"),
	Crate: ObstacleKind.make("crate"),
	Platform: ObstacleKind.make("platform"),
	Chest: ObstacleKind.make("chest"),
} as const;

const NonNegativeFinite = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
export const Obstacle = Schema.Struct({
	height: NonNegativeFinite,
	kind: ObstacleKind,
});
export type Obstacle = typeof Obstacle.Type;

export const DecorationKind = Schema.Literals(["rug", "plant", "lamp", "sign"]);
export type DecorationKind = typeof DecorationKind.Type;

export const DecorationKinds = {
	Rug: DecorationKind.make("rug"),
	Plant: DecorationKind.make("plant"),
	Lamp: DecorationKind.make("lamp"),
	Sign: DecorationKind.make("sign"),
} as const;

export const Decoration = Schema.Struct({
	kind: DecorationKind,
	height: NonNegativeFinite,
});
export type Decoration = typeof Decoration.Type;

export const SignContent = Schema.Struct({
	title: Schema.String,
	body: Schema.String,
});
export type SignContent = typeof SignContent.Type;

export const defaultSignContent = SignContent.make({
	title: "Notice",
	body: "Scientists at the University of Camebrood are sounding the alarm, suggesting the increased volcanic activity in the region may have been initiated by a tactical nuclear strike on the north-east corner of Mount Egg. High-powered lasers were likely used to drill what is now believed to be the deepest egg-made hole in egg history. The detonation depth and the smaller size of the warhead resulted in none of the usual signs of a nuclear attack, which was first believed to be natural, albeit powerful, seismic activity. As previously stated, all eggs are advised to begin evacuating the island immediately.",
});
