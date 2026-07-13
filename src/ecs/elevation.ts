import { type Body, ObstacleKinds, type Position } from "../model/component";
import { type EditorItemKind, EditorItemKinds } from "../model/editor";
import type { EntityId } from "../model/entity-id";
import { editorItemKindForEntity } from "./editor-sizing";
import { groundElevation, type World } from "./world";

export const entityBaseElevation = (world: World, entity: EntityId): number =>
	world.elevations.get(entity)?.z ?? groundElevation;

export const entityHeight = (world: World, entity: EntityId): number =>
	world.obstacles.get(entity)?.height ??
	world.decorations.get(entity)?.height ??
	0;

export const entityTopElevation = (world: World, entity: EntityId): number =>
	entityBaseElevation(world, entity) + entityHeight(world, entity);

export const verticalRangesOverlap = (
	base: number,
	height: number,
	otherBase: number,
	otherHeight: number,
): boolean => base < otherBase + otherHeight && otherBase < base + height;

export const containsFootprint = (
	containerPosition: Position,
	containerBody: Body,
	position: Position,
	body: Body,
): boolean =>
	position.x - body.width / 2 >=
		containerPosition.x - containerBody.width / 2 &&
	position.x + body.width / 2 <=
		containerPosition.x + containerBody.width / 2 &&
	position.y - body.depth / 2 >=
		containerPosition.y - containerBody.depth / 2 &&
	position.y + body.depth / 2 <= containerPosition.y + containerBody.depth / 2;

export const canSitOnPlatform = (kind: EditorItemKind): boolean =>
	kind === EditorItemKinds.Crate ||
	kind === EditorItemKinds.Plant ||
	kind === EditorItemKinds.Lamp;

export const placementElevationForKind = (
	world: World,
	kind: EditorItemKind,
	position: Position,
	body: Body,
	excludedEntity?: EntityId,
): number => {
	if (!canSitOnPlatform(kind)) return groundElevation;
	let elevation = groundElevation;
	for (const [entity, obstacle] of world.obstacles) {
		if (entity === excludedEntity || obstacle.kind !== ObstacleKinds.Platform)
			continue;
		const platformPosition = world.positions.get(entity);
		const platformBody = world.bodies.get(entity);
		if (
			platformPosition !== undefined &&
			platformBody !== undefined &&
			containsFootprint(platformPosition, platformBody, position, body)
		)
			elevation = Math.max(elevation, entityTopElevation(world, entity));
	}
	return elevation;
};

export const placementElevationForEntity = (
	world: World,
	entity: EntityId,
	position: Position,
	body: Body,
): number => {
	const kind = editorItemKindForEntity(world, entity);
	return kind === undefined
		? entityBaseElevation(world, entity)
		: placementElevationForKind(world, kind, position, body, entity);
};
