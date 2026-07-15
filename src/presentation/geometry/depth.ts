import { dual } from "effect/Function";
import type { Body } from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import { overlaps } from "../../world/spatial/collision";
import {
	bodyBoundsOverlap,
	canSitOnSupport,
	entityBaseElevation,
	entityTopElevation,
	spatialKindForEntity,
} from "../../world/spatial/elevation";
import {
	groundElevation,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	type World,
} from "../../world/world";
import { visualDepth } from "./projection";

export const supportedObjectDepthOffset = 0.5;
const supportSurfaceDepthSpan = 0.25;
const playerDepthTieBreak = 0.001;

const supportSurfaceProgress = (
	supportPositionY: number,
	supportDepth: number,
	positionY: number,
): number => {
	const backEdge = supportPositionY - supportDepth / 2;
	return Math.min(1, Math.max(0, (positionY - backEdge) / supportDepth));
};

const renderDepthForEntityInternal = (
	world: World,
	entity: EntityId,
	visited: ReadonlySet<EntityId>,
): number => {
	const position = world.positions.get(entity);
	const body = world.bodies.get(entity);
	if (position === undefined || body === undefined)
		return Number.NEGATIVE_INFINITY;

	let depth = visualDepth(position);
	const baseElevation = entityBaseElevation(world, entity);
	if (baseElevation <= groundElevation) return depth;
	const kind = spatialKindForEntity(world, entity);
	if (kind === undefined || visited.has(entity)) return depth;
	const nextVisited = new Set(visited).add(entity);

	for (const [supportEntity, obstacle] of world.obstacles) {
		if (
			supportEntity === entity ||
			!canSitOnSupport({ kind, supportKind: obstacle.kind }) ||
			Math.abs(baseElevation - entityTopElevation(world, supportEntity)) >
				obstacleHeightTolerance
		)
			continue;
		const supportPosition = world.positions.get(supportEntity);
		const supportBody = world.bodies.get(supportEntity);
		if (
			supportPosition === undefined ||
			supportBody === undefined ||
			!bodyBoundsOverlap({
				position: supportPosition,
				body: supportBody,
				otherPosition: position,
				otherBody: body,
			})
		)
			continue;

		const surfaceProgress = supportSurfaceProgress(
			supportPosition.y,
			supportBody.depth,
			position.y,
		);
		depth = Math.max(
			depth,
			renderDepthForEntityInternal(world, supportEntity, nextVisited) +
				supportedObjectDepthOffset +
				surfaceProgress * supportSurfaceDepthSpan,
		);
	}

	return depth;
};

export const renderDepthForEntity = dual<
	(entity: EntityId) => (self: World) => number,
	(self: World, entity: EntityId) => number
>(2, (world: World, entity: EntityId): number =>
	renderDepthForEntityInternal(world, entity, new Set()),
);

export const renderDepthForCharacter = dual<
	(character: EntityId, body: Body) => (self: World) => number,
	(self: World, character: EntityId, body: Body) => number
>(3, (world: World, character: EntityId, body: Body): number => {
	const position = world.positions.get(character);
	const elevation = world.elevations.get(character);
	if (position === undefined || elevation === undefined)
		return Number.NEGATIVE_INFINITY;

	let depth = visualDepth(position);
	for (const [entity] of world.obstacles) {
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		if (
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			elevation.z >=
				entityTopElevation(world, entity) - obstacleHeightTolerance &&
			overlaps({
				position,
				body,
				otherPosition: obstaclePosition,
				otherBody: obstacleBody,
			})
		) {
			const surfaceProgress = supportSurfaceProgress(
				obstaclePosition.y,
				obstacleBody.depth,
				position.y,
			);
			depth = Math.max(
				depth,
				renderDepthForEntity(world, entity) +
					supportedObjectDepthOffset +
					surfaceProgress * supportSurfaceDepthSpan +
					playerDepthTieBreak,
			);
		}
	}
	return depth;
});

export const renderDepthForPlayer = (world: World): number =>
	renderDepthForCharacter(world, playerEntity, playerBody);
