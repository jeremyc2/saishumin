import {
	containsFootprint,
	entityBaseElevation,
	entityTopElevation,
} from "../ecs/elevation";
import {
	groundElevation,
	obstacleHeightTolerance,
	type World,
} from "../ecs/world";
import { ObstacleKinds } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { visualDepth } from "./projection";

export const supportedObjectDepthOffset = 0.5;
const platformSurfaceDepthSpan = 0.25;

export const renderDepthForEntity = (
	world: World,
	entity: EntityId,
): number => {
	const position = world.positions.get(entity);
	const body = world.bodies.get(entity);
	if (position === undefined || body === undefined)
		return Number.NEGATIVE_INFINITY;

	let depth = visualDepth(position);
	const baseElevation = entityBaseElevation(world, entity);
	if (baseElevation <= groundElevation) return depth;

	for (const [platformEntity, obstacle] of world.obstacles) {
		if (
			platformEntity === entity ||
			obstacle.kind !== ObstacleKinds.Platform ||
			Math.abs(baseElevation - entityTopElevation(world, platformEntity)) >
				obstacleHeightTolerance
		)
			continue;
		const platformPosition = world.positions.get(platformEntity);
		const platformBody = world.bodies.get(platformEntity);
		if (
			platformPosition === undefined ||
			platformBody === undefined ||
			!containsFootprint(platformPosition, platformBody, position, body)
		)
			continue;

		const backEdge = platformPosition.y - platformBody.depth / 2;
		const surfaceProgress = Math.min(
			1,
			Math.max(0, (position.y - backEdge) / platformBody.depth),
		);
		depth = Math.max(
			depth,
			visualDepth(platformPosition) +
				supportedObjectDepthOffset +
				surfaceProgress * platformSurfaceDepthSpan,
		);
	}

	return depth;
};
