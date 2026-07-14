import { entityTopElevation } from "../ecs/elevation";
import {
	groundElevation,
	obstacleHeightTolerance,
	type World,
} from "../ecs/world";
import type { Position } from "../model/component";
import type { PlayerTrailMark } from "../model/player-trail";
import { projectedRectangle } from "./projection";

export const playerTireTrackSurfaceOutline = (
	world: World,
	mark: PlayerTrailMark,
): ReadonlyArray<Position> | undefined => {
	if (mark.supportEntity === null) {
		if (Math.abs(mark.elevation - groundElevation) > obstacleHeightTolerance)
			return undefined;
		return projectedRectangle(
			{
				x: world.floorPlan.width / 2,
				y: world.floorPlan.depth / 2,
			},
			world.floorPlan,
			groundElevation,
		);
	}

	const position = world.positions.get(mark.supportEntity);
	const body = world.bodies.get(mark.supportEntity);
	if (
		position === undefined ||
		body === undefined ||
		Math.abs(entityTopElevation(world, mark.supportEntity) - mark.elevation) >
			obstacleHeightTolerance
	)
		return undefined;
	return projectedRectangle(position, body, mark.elevation);
};
