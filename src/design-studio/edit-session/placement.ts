import { dual } from "effect/Function";
import {
	type Body,
	CharacterKinds,
	type Position,
} from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import {
	isSolidEntity,
	overlaps,
	surfaceAt,
} from "../../world/spatial/collision";
import {
	entityBaseElevation,
	entityHeight,
	entityTopElevation,
	placementElevationForEntity,
	placementElevationForKind,
	verticalRangesOverlap,
} from "../../world/spatial/elevation";
import { isSupportSurfaceTransformValid } from "../../world/spatial/support-surface";
import {
	characterSpawnPosition,
	isPlayerEntity,
	lavaMonsterCollisionHeight,
	obstacleHeightTolerance,
	playerCollisionHeight,
	type World,
} from "../../world/world";
import {
	CharacterSpawnKinds,
	type DesignStudioItemKind,
	defaultEditorItemHeight,
	EditorItemKinds,
	spatialEditorItemKind,
} from "../model";

export type OriginalPlacement = {
	readonly position: Position;
	readonly body: Body;
};

const isBlockingEntity = (world: World, entity: EntityId): boolean =>
	!isPlayerEntity(world, entity) && isSolidEntity(world, entity);

const placementBoundaryTolerance = 0.000_001;

export const isInsideFloorPlan = dual<
	(position: Position, body: Body) => (self: World) => boolean,
	(self: World, position: Position, body: Body) => boolean
>(3, (world: World, position: Position, body: Body): boolean =>
	isInsideBody(world.floorPlan, world.floorOrigin, position, body),
);

const isInsideBody = (
	container: Body,
	containerOrigin: Position,
	position: Position,
	body: Body,
): boolean =>
	position.x - body.width / 2 >=
		containerOrigin.x - placementBoundaryTolerance &&
	position.x + body.width / 2 <=
		containerOrigin.x + container.width + placementBoundaryTolerance &&
	position.y - body.depth / 2 >=
		containerOrigin.y - placementBoundaryTolerance &&
	position.y + body.depth / 2 <=
		containerOrigin.y + container.depth + placementBoundaryTolerance;

export const isFloorPlanPlacementValid = dual<
	(floorPlan: Body) => (self: World) => boolean,
	(self: World, floorPlan: Body) => boolean
>(2, (world: World, floorPlan: Body): boolean => {
	for (const [entity, position] of world.positions) {
		if (world.characters.has(entity)) continue;
		const body = world.bodies.get(entity);
		if (
			body !== undefined &&
			!isInsideBody(floorPlan, world.floorOrigin, position, body)
		)
			return false;
	}
	for (const [entity, position] of world.characterSpawns) {
		const body = world.bodies.get(entity);
		if (
			body !== undefined &&
			!isInsideBody(floorPlan, world.floorOrigin, position, body)
		)
			return false;
	}
	return true;
});

export const isEntityPlacementValid = dual<
	(
		entity: EntityId,
		position: Position,
		body: Body,
		originalPlacement?: OriginalPlacement,
	) => (self: World) => boolean,
	(
		self: World,
		entity: EntityId,
		position: Position,
		body: Body,
		originalPlacement?: OriginalPlacement,
	) => boolean
>(
	(arguments_) => typeof arguments_[0] === "object",
	(
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
		const resized =
			originalPlacement !== undefined &&
			(body.width !== originalPlacement.body.width ||
				body.depth !== originalPlacement.body.depth);
		const maximumElevation = resized
			? placementElevationForEntity(
					world,
					entity,
					originalPlacement.position,
					originalPlacement.body,
				)
			: Number.POSITIVE_INFINITY;
		const base = placementElevationForEntity(
			world,
			entity,
			position,
			body,
			maximumElevation,
		);
		const height = entityHeight(world, entity);

		for (const [otherEntity, otherPosition] of world.positions) {
			if (otherEntity === entity || !isBlockingEntity(world, otherEntity))
				continue;
			const otherBody = world.bodies.get(otherEntity);
			if (
				otherBody !== undefined &&
				overlaps({ position, body, otherPosition, otherBody }) &&
				verticalRangesOverlap({
					base,
					height,
					otherBase: entityBaseElevation(world, otherEntity),
					otherHeight: entityHeight(world, otherEntity),
				})
			)
				return false;
		}
		return true;
	},
);

export const isNewEditorItemPlacementValid = dual<
	(
		kind: DesignStudioItemKind,
		position: Position,
		body: Body,
	) => (self: World) => boolean,
	(
		self: World,
		kind: DesignStudioItemKind,
		position: Position,
		body: Body,
	) => boolean
>(
	4,
	(
		world: World,
		kind: DesignStudioItemKind,
		position: Position,
		body: Body,
	): boolean => {
		if (
			kind === CharacterSpawnKinds.Player ||
			kind === CharacterSpawnKinds.LavaMonster
		)
			return isCharacterSpawnPlacementValid({
				world,
				kind,
				position,
				body,
			});
		if (!isInsideFloorPlan(world, position, body)) return false;
		if (kind === EditorItemKinds.Hopscotch) return true;
		const spatialKind = spatialEditorItemKind(kind);
		if (spatialKind === undefined) return false;
		const base = placementElevationForKind(world, spatialKind, position, body);
		const height = defaultEditorItemHeight(kind);

		for (const [entity, otherPosition] of world.positions) {
			if (!isBlockingEntity(world, entity)) continue;
			const otherBody = world.bodies.get(entity);
			if (
				otherBody !== undefined &&
				overlaps({ position, body, otherPosition, otherBody }) &&
				verticalRangesOverlap({
					base,
					height,
					otherBase: entityBaseElevation(world, entity),
					otherHeight: entityHeight(world, entity),
				})
			)
				return false;
		}
		return true;
	},
);

export const isCharacterSpawnPlacementValid = ({
	world,
	kind,
	position,
	body,
	entity,
}: {
	readonly world: World;
	readonly kind:
		| typeof CharacterSpawnKinds.Player
		| typeof CharacterSpawnKinds.LavaMonster;
	readonly position: Position;
	readonly body: Body;
	readonly entity?: EntityId;
}): boolean => {
	if (!isInsideFloorPlan(world, position, body)) return false;
	if (
		kind === CharacterSpawnKinds.Player &&
		[...world.characters].some(
			([otherEntity, character]) =>
				otherEntity !== entity && character.kind === CharacterKinds.Player,
		)
	)
		return false;

	const elevation = surfaceAt(world, position, body);
	for (const [otherEntity, otherPosition] of world.positions) {
		if (
			otherEntity === entity ||
			world.characters.has(otherEntity) ||
			!isSolidEntity(world, otherEntity) ||
			elevation >=
				entityTopElevation(world, otherEntity) - obstacleHeightTolerance
		)
			continue;
		const otherBody = world.bodies.get(otherEntity);
		if (
			otherBody !== undefined &&
			overlaps({ position, body, otherPosition, otherBody })
		)
			return false;
	}

	const height =
		kind === CharacterSpawnKinds.Player
			? playerCollisionHeight
			: lavaMonsterCollisionHeight;
	for (const [otherEntity, character] of world.characters) {
		if (otherEntity === entity) continue;
		const otherPosition = characterSpawnPosition({
			world,
			entity: otherEntity,
		});
		const otherBody = world.bodies.get(otherEntity);
		if (otherPosition === undefined || otherBody === undefined) continue;
		const otherElevation = surfaceAt(world, otherPosition, otherBody);
		const otherHeight =
			character.kind === CharacterKinds.Player
				? playerCollisionHeight
				: lavaMonsterCollisionHeight;
		if (
			overlaps({ position, body, otherPosition, otherBody }) &&
			verticalRangesOverlap({
				base: elevation,
				height,
				otherBase: otherElevation,
				otherHeight,
			})
		)
			return false;
	}
	return true;
};
