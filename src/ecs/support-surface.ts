import type { Body, Position } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { editorItemKindForEntity } from "./editor-sizing";
import {
	canSitOnSupport,
	entityBaseElevation,
	entityTopElevation,
	footprintsOverlap,
} from "./elevation";
import { obstacleHeightTolerance, type World } from "./world";

export const entitiesSupportedBy = (
	world: World,
	surfaceEntity: EntityId,
	surfacePosition: Position,
	surfaceBody: Body,
): ReadonlyArray<EntityId> => {
	const surfaceObstacle = world.obstacles.get(surfaceEntity);
	if (
		surfaceObstacle === undefined ||
		(surfaceObstacle.kind !== "platform" && surfaceObstacle.kind !== "crate")
	)
		return [];

	const surfaceTop = entityTopElevation(world, surfaceEntity);
	const supported: Array<EntityId> = [];
	for (const [entity, position] of world.positions) {
		if (entity === surfaceEntity) continue;
		const kind = editorItemKindForEntity(world, entity);
		const body = world.bodies.get(entity);
		if (
			kind !== undefined &&
			canSitOnSupport(kind, surfaceObstacle.kind) &&
			body !== undefined &&
			Math.abs(entityBaseElevation(world, entity) - surfaceTop) <=
				obstacleHeightTolerance &&
			footprintsOverlap(surfacePosition, surfaceBody, position, body)
		)
			supported.push(entity);
	}
	return supported;
};

export const isSupportSurfaceOccupied = (
	world: World,
	surfaceEntity: EntityId,
	surfacePosition: Position,
	surfaceBody: Body,
): boolean =>
	entitiesSupportedBy(world, surfaceEntity, surfacePosition, surfaceBody)
		.length > 0;

export const isSupportSurfaceTransformValid = (
	world: World,
	surfaceEntity: EntityId,
	position: Position,
	body: Body,
	originalPosition: Position,
	originalBody: Body,
): boolean => {
	const supported = entitiesSupportedBy(
		world,
		surfaceEntity,
		originalPosition,
		originalBody,
	);
	if (supported.length === 0) return true;
	if (position.x !== originalPosition.x || position.y !== originalPosition.y)
		return false;

	return supported.every((entity) => {
		const supportedPosition = world.positions.get(entity);
		const supportedBody = world.bodies.get(entity);
		return (
			supportedPosition !== undefined &&
			supportedBody !== undefined &&
			footprintsOverlap(position, body, supportedPosition, supportedBody)
		);
	});
};
