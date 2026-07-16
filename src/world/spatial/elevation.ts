import { dual } from "effect/Function";
import {
	type Body,
	CharacterKinds,
	type DecorationKind,
	DecorationKinds,
	isDecorationKind,
	isObstacleKind,
	type ObstacleKind,
	ObstacleKinds,
	type Position,
} from "../components";
import type { EntityId } from "../entity-id";
import {
	groundElevation,
	lavaMonsterCollisionHeight,
	obstacleHeightTolerance,
	type World,
} from "../world";

export const entityBaseElevation = dual<
	(entity: EntityId) => (self: World) => number,
	(self: World, entity: EntityId) => number
>(
	2,
	(world: World, entity: EntityId): number =>
		world.elevations.get(entity)?.z ?? groundElevation,
);

export const entityHeight = dual<
	(entity: EntityId) => (self: World) => number,
	(self: World, entity: EntityId) => number
>(2, (world: World, entity: EntityId): number =>
	world.characters.get(entity)?.kind === CharacterKinds.LavaMonster
		? lavaMonsterCollisionHeight
		: (world.obstacles.get(entity)?.height ??
			world.decorations.get(entity)?.height ??
			0),
);

export const entityTopElevation = dual<
	(entity: EntityId) => (self: World) => number,
	(self: World, entity: EntityId) => number
>(
	2,
	(world: World, entity: EntityId): number =>
		entityBaseElevation(world, entity) + entityHeight(world, entity),
);

export const verticalRangesOverlap = ({
	base,
	height,
	otherBase,
	otherHeight,
}: {
	readonly base: number;
	readonly height: number;
	readonly otherBase: number;
	readonly otherHeight: number;
}): boolean => base < otherBase + otherHeight && otherBase < base + height;

export const containsBodyBounds = ({
	containerPosition,
	containerBody,
	position,
	body,
}: {
	readonly containerPosition: Position;
	readonly containerBody: Body;
	readonly position: Position;
	readonly body: Body;
}): boolean =>
	position.x - body.width / 2 >=
		containerPosition.x - containerBody.width / 2 &&
	position.x + body.width / 2 <=
		containerPosition.x + containerBody.width / 2 &&
	position.y - body.depth / 2 >=
		containerPosition.y - containerBody.depth / 2 &&
	position.y + body.depth / 2 <= containerPosition.y + containerBody.depth / 2;

export const bodyBoundsOverlap = ({
	position,
	body,
	otherPosition,
	otherBody,
}: {
	readonly position: Position;
	readonly body: Body;
	readonly otherPosition: Position;
	readonly otherBody: Body;
}): boolean =>
	Math.abs(position.x - otherPosition.x) < (body.width + otherBody.width) / 2 &&
	Math.abs(position.y - otherPosition.y) < (body.depth + otherBody.depth) / 2;

export type SpatialEntityKind = typeof ObstacleKind.Type | DecorationKind;

export const spatialKindForEntity = dual<
	(entity: EntityId) => (self: World) => SpatialEntityKind | undefined,
	(self: World, entity: EntityId) => SpatialEntityKind | undefined
>(2, (world: World, entity: EntityId): SpatialEntityKind | undefined => {
	const kind =
		world.obstacles.get(entity)?.kind ?? world.decorations.get(entity)?.kind;
	return isObstacleKind(kind) || isDecorationKind(kind) ? kind : undefined;
});

export const canSitOnPlatform = (kind: SpatialEntityKind): boolean =>
	kind === ObstacleKinds.Crate ||
	kind === DecorationKinds.Plant ||
	kind === DecorationKinds.Lamp ||
	kind === DecorationKinds.Sign ||
	kind === ObstacleKinds.Chest;

export const canSitOnSupport = ({
	kind,
	supportKind,
}: {
	readonly kind: SpatialEntityKind;
	readonly supportKind: typeof ObstacleKind.Type;
}): boolean =>
	supportKind === ObstacleKinds.Platform
		? canSitOnPlatform(kind)
		: supportKind === ObstacleKinds.Crate && kind === ObstacleKinds.Crate;

export const placementElevationForKind = dual<
	(
		kind: SpatialEntityKind,
		position: Position,
		body: Body,
		excludedEntity?: EntityId,
		maximumElevation?: number,
	) => (self: World) => number,
	(
		self: World,
		kind: SpatialEntityKind,
		position: Position,
		body: Body,
		excludedEntity?: EntityId,
		maximumElevation?: number,
	) => number
>(
	(arguments_) => typeof arguments_[0] === "object",
	(
		world: World,
		kind: SpatialEntityKind,
		position: Position,
		body: Body,
		excludedEntity?: EntityId,
		maximumElevation: number = Number.POSITIVE_INFINITY,
	): number => {
		if (!canSitOnPlatform(kind)) return groundElevation;
		let elevation = groundElevation;
		for (const [entity, obstacle] of world.obstacles) {
			if (
				entity === excludedEntity ||
				!canSitOnSupport({ kind, supportKind: obstacle.kind })
			)
				continue;
			const platformPosition = world.positions.get(entity);
			const platformBody = world.bodies.get(entity);
			const surfaceTop = entityTopElevation(world, entity);
			if (
				platformPosition !== undefined &&
				platformBody !== undefined &&
				surfaceTop <= maximumElevation + obstacleHeightTolerance &&
				bodyBoundsOverlap({
					position: platformPosition,
					body: platformBody,
					otherPosition: position,
					otherBody: body,
				})
			)
				elevation = Math.max(elevation, surfaceTop);
		}
		return elevation;
	},
);

export const placementElevationForEntity = dual<
	(
		entity: EntityId,
		position: Position,
		body: Body,
		maximumElevation?: number,
	) => (self: World) => number,
	(
		self: World,
		entity: EntityId,
		position: Position,
		body: Body,
		maximumElevation?: number,
	) => number
>(
	(arguments_) => typeof arguments_[0] === "object",
	(
		world: World,
		entity: EntityId,
		position: Position,
		body: Body,
		maximumElevation: number = Number.POSITIVE_INFINITY,
	): number => {
		const kind = spatialKindForEntity(world, entity);
		return kind === undefined
			? entityBaseElevation(world, entity)
			: placementElevationForKind(
					world,
					kind,
					position,
					body,
					entity,
					maximumElevation,
				);
	},
);

export const shadowElevationForEntity = dual<
	(entity: EntityId, position: Position, body: Body) => (self: World) => number,
	(self: World, entity: EntityId, position: Position, body: Body) => number
>(
	4,
	(world: World, entity: EntityId, position: Position, body: Body): number => {
		const base = entityBaseElevation(world, entity);
		const kind = spatialKindForEntity(world, entity);
		if (kind === undefined) return base;

		for (const [supportEntity, support] of world.obstacles) {
			if (
				supportEntity === entity ||
				!canSitOnSupport({ kind, supportKind: support.kind }) ||
				Math.abs(entityTopElevation(world, supportEntity) - base) >
					obstacleHeightTolerance
			)
				continue;
			const supportPosition = world.positions.get(supportEntity);
			const supportBody = world.bodies.get(supportEntity);
			if (
				supportPosition !== undefined &&
				supportBody !== undefined &&
				containsBodyBounds({
					containerPosition: supportPosition,
					containerBody: supportBody,
					position,
					body,
				})
			)
				return base;
		}

		return placementElevationForEntity(
			world,
			entity,
			position,
			body,
			base - obstacleHeightTolerance * 2,
		);
	},
);

export type ShadowSection = {
	readonly position: Position;
	readonly body: Body;
	readonly elevation: number;
};

const shadowSection = (
	left: number,
	right: number,
	back: number,
	front: number,
	elevation: number,
): ShadowSection | undefined =>
	right <= left || front <= back
		? undefined
		: {
				position: {
					x: (left + right) / 2,
					y: (back + front) / 2,
				},
				body: { width: right - left, depth: front - back },
				elevation,
			};

export const shadowSectionsForEntity = dual<
	(
		entity: EntityId,
		position: Position,
		body: Body,
	) => (self: World) => ReadonlyArray<ShadowSection>,
	(
		self: World,
		entity: EntityId,
		position: Position,
		body: Body,
	) => ReadonlyArray<ShadowSection>
>(
	4,
	(
		world: World,
		entity: EntityId,
		position: Position,
		body: Body,
	): ReadonlyArray<ShadowSection> => {
		const base = entityBaseElevation(world, entity);
		const lowerElevation = shadowElevationForEntity(
			world,
			entity,
			position,
			body,
		);
		const kind = spatialKindForEntity(world, entity);
		if (kind === undefined || lowerElevation === base)
			return [{ position, body, elevation: base }];

		const left = position.x - body.width / 2;
		const right = position.x + body.width / 2;
		const back = position.y - body.depth / 2;
		const front = position.y + body.depth / 2;
		let largestIntersection:
			| {
					readonly left: number;
					readonly right: number;
					readonly back: number;
					readonly front: number;
					readonly area: number;
			  }
			| undefined;

		for (const [supportEntity, support] of world.obstacles) {
			if (
				supportEntity === entity ||
				!canSitOnSupport({ kind, supportKind: support.kind }) ||
				Math.abs(entityTopElevation(world, supportEntity) - base) >
					obstacleHeightTolerance
			)
				continue;
			const supportPosition = world.positions.get(supportEntity);
			const supportBody = world.bodies.get(supportEntity);
			if (supportPosition === undefined || supportBody === undefined) continue;
			const intersection = {
				left: Math.max(left, supportPosition.x - supportBody.width / 2),
				right: Math.min(right, supportPosition.x + supportBody.width / 2),
				back: Math.max(back, supportPosition.y - supportBody.depth / 2),
				front: Math.min(front, supportPosition.y + supportBody.depth / 2),
			};
			const area =
				Math.max(0, intersection.right - intersection.left) *
				Math.max(0, intersection.front - intersection.back);
			if (area > (largestIntersection?.area ?? 0))
				largestIntersection = { ...intersection, area };
		}

		if (largestIntersection === undefined)
			return [{ position, body, elevation: lowerElevation }];
		const intersection = largestIntersection;
		// A rear overhang is hidden behind its support in this projection. Projecting
		// it onto a lower plane would make it appear across the support's front face.
		return [
			shadowSection(left, intersection.left, back, front, lowerElevation),
			shadowSection(intersection.right, right, back, front, lowerElevation),
			shadowSection(
				intersection.left,
				intersection.right,
				intersection.front,
				front,
				lowerElevation,
			),
		].filter((section): section is ShadowSection => section !== undefined);
	},
);
