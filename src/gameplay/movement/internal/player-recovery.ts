import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../../../world/spatial/player-placement";
import { playerEntityIn, type World } from "../../../world/world";

/** Restores a player displaced into an invalid position by a world transition. */
export const recoverInvalidPlayerPlacement = (world: World): World => {
	const playerEntity = playerEntityIn(world);
	if (playerEntity === undefined) return world;
	const position = world.positions.get(playerEntity);
	const elevation = world.elevations.get(playerEntity);
	if (
		position === undefined ||
		elevation === undefined ||
		isPlayerPlacementValid(world, position, elevation.z)
	)
		return world;
	const safePosition = nearestValidPlayerPosition(world, position, elevation.z);
	if (safePosition === undefined) return world;
	const positions = new Map(world.positions);
	positions.set(playerEntity, safePosition);
	return { ...world, positions };
};
