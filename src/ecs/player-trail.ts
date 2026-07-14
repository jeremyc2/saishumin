import {
	type PlayerTrailMark,
	playerTrailLifetimeSeconds,
	playerTrailMarkSpacing,
} from "../model/player-trail";
import { supportSurfaceAt } from "./collision";
import {
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "./world";

const distanceBetween = (
	left: PlayerTrailMark["position"],
	right: PlayerTrailMark["position"],
): number => Math.hypot(right.x - left.x, right.y - left.y);

export const advancePlayerTrail = (
	previous: World,
	moved: World,
	elapsed: number,
): World => {
	const aged = previous.playerTrail
		.map((mark) => ({ ...mark, age: mark.age + elapsed }))
		.filter((mark) => mark.age < playerTrailLifetimeSeconds);
	const previousPosition = previous.positions.get(playerEntity);
	const position = moved.positions.get(playerEntity);
	const elevation = moved.elevations.get(playerEntity);

	if (
		previousPosition === undefined ||
		position === undefined ||
		elevation === undefined
	) {
		return previous.playerTrail.length === 0
			? moved
			: { ...moved, playerTrail: aged };
	}

	const movedDistance = Math.hypot(
		position.x - previousPosition.x,
		position.y - previousPosition.y,
	);
	const support = supportSurfaceAt(moved, position, playerBody, elevation.z);
	const surface = support.elevation;
	const isGrounded =
		elevation.velocity === stationaryVelocity && elevation.z === surface;
	const lastMark = aged.at(-1);
	const farEnoughFromLastMark =
		lastMark === undefined ||
		distanceBetween(lastMark.position, position) >= playerTrailMarkSpacing;

	if (movedDistance > 0 && isGrounded && farEnoughFromLastMark) {
		const mark: PlayerTrailMark = {
			position,
			elevation: surface,
			supportEntity: support.entity,
			facing: moved.playerFacing,
			age: 0,
		};
		return { ...moved, playerTrail: [...aged, mark] };
	}

	if (previous.playerTrail.length === 0) return moved;
	return { ...moved, playerTrail: aged };
};
