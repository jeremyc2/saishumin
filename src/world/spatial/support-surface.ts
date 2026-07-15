import { dual } from "effect/Function";
import type { Pipeable } from "../../pipeable";
import type { Body, Position } from "../components";
import type { EntityId } from "../entity-id";
import { obstacleHeightTolerance, type World } from "../world";
import {
	bodyBoundsOverlap,
	canSitOnSupport,
	entityBaseElevation,
	entityTopElevation,
	spatialKindForEntity,
} from "./elevation";

export const entitiesSupportedBy: Pipeable<
	World,
	[surfaceEntity: EntityId, surfacePosition: Position, surfaceBody: Body],
	ReadonlyArray<EntityId>
> = dual(
	4,
	(
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
			const kind = spatialKindForEntity(world, entity);
			const body = world.bodies.get(entity);
			if (
				kind !== undefined &&
				canSitOnSupport({ kind, supportKind: surfaceObstacle.kind }) &&
				body !== undefined &&
				Math.abs(entityBaseElevation(world, entity) - surfaceTop) <=
					obstacleHeightTolerance &&
				bodyBoundsOverlap({
					position: surfacePosition,
					body: surfaceBody,
					otherPosition: position,
					otherBody: body,
				})
			)
				supported.push(entity);
		}
		return supported;
	},
);

export const isSupportSurfaceOccupied: Pipeable<
	World,
	[surfaceEntity: EntityId, surfacePosition: Position, surfaceBody: Body],
	boolean
> = dual(
	4,
	(
		world: World,
		surfaceEntity: EntityId,
		surfacePosition: Position,
		surfaceBody: Body,
	): boolean =>
		entitiesSupportedBy(world, surfaceEntity, surfacePosition, surfaceBody)
			.length > 0,
);

export const isSupportSurfaceTransformValid: Pipeable<
	World,
	[
		surfaceEntity: EntityId,
		position: Position,
		body: Body,
		originalPosition: Position,
		originalBody: Body,
	],
	boolean
> = dual(
	6,
	(
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
				bodyBoundsOverlap({
					position,
					body,
					otherPosition: supportedPosition,
					otherBody: supportedBody,
				})
			);
		});
	},
);
