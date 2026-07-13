import type { Body, Position } from "../model/component";
import {
	defaultEditorItemHeight,
	type EditorItemKind,
	EditorItemKinds,
} from "../model/editor";
import type { EntityId } from "../model/entity-id";
import { isSolidEntity, overlaps } from "./collision";
import {
	entityBaseElevation,
	entityHeight,
	placementElevationForEntity,
	placementElevationForKind,
	verticalRangesOverlap,
} from "./elevation";
import { isSupportSurfaceTransformValid } from "./support-surface";
import { playerEntity, type World } from "./world";

export type OriginalPlacement = {
	readonly position: Position;
	readonly body: Body;
};

const isBlockingEntity = (world: World, entity: EntityId): boolean =>
	entity !== playerEntity && isSolidEntity(world, entity);

export const isInsideFloorPlan = (
	world: World,
	position: Position,
	body: Body,
): boolean => isInsideBody(world.floorPlan, position, body);

const isInsideBody = (
	container: Body,
	position: Position,
	body: Body,
): boolean =>
	position.x - body.width / 2 >= 0 &&
	position.x + body.width / 2 <= container.width &&
	position.y - body.depth / 2 >= 0 &&
	position.y + body.depth / 2 <= container.depth;

export const isFloorPlanPlacementValid = (
	world: World,
	floorPlan: Body,
): boolean => {
	for (const [entity, position] of world.positions) {
		if (entity === playerEntity) continue;
		const body = world.bodies.get(entity);
		if (body !== undefined && !isInsideBody(floorPlan, position, body))
			return false;
	}
	return true;
};

export const isEntityPlacementValid = (
	world: World,
	entity: EntityId,
	position: Position,
	body: Body,
	originalPlacement?: OriginalPlacement,
): boolean => {
	if (!isInsideFloorPlan(world, position, body)) return false;
	if (
		originalPlacement !== undefined &&
		!isSupportSurfaceTransformValid(
			world,
			entity,
			position,
			body,
			originalPlacement.position,
			originalPlacement.body,
		)
	)
		return false;
	if (!isBlockingEntity(world, entity)) return true;
	const base = placementElevationForEntity(world, entity, position, body);
	const height = entityHeight(world, entity);

	for (const [otherEntity, otherPosition] of world.positions) {
		if (otherEntity === entity || !isBlockingEntity(world, otherEntity))
			continue;
		const otherBody = world.bodies.get(otherEntity);
		if (
			otherBody !== undefined &&
			overlaps(position, body, otherPosition, otherBody) &&
			verticalRangesOverlap(
				base,
				height,
				entityBaseElevation(world, otherEntity),
				entityHeight(world, otherEntity),
			)
		)
			return false;
	}
	return true;
};

export const isNewEditorItemPlacementValid = (
	world: World,
	kind: EditorItemKind,
	position: Position,
	body: Body,
): boolean => {
	if (!isInsideFloorPlan(world, position, body)) return false;
	if (kind === EditorItemKinds.Rug) return true;
	const base = placementElevationForKind(world, kind, position, body);
	const height = defaultEditorItemHeight(kind);

	for (const [entity, otherPosition] of world.positions) {
		if (!isBlockingEntity(world, entity)) continue;
		const otherBody = world.bodies.get(entity);
		if (
			otherBody !== undefined &&
			overlaps(position, body, otherPosition, otherBody) &&
			verticalRangesOverlap(
				base,
				height,
				entityBaseElevation(world, entity),
				entityHeight(world, entity),
			)
		)
			return false;
	}
	return true;
};
