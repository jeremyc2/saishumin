import type { Position } from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import { isSolidEntity, overlaps } from "../../../world/spatial/collision";
import {
	entityTopElevation,
	verticalRangesOverlap,
} from "../../../world/spatial/elevation";
import {
	groundElevation,
	isPlayerEntity,
	lavaMonsterBody,
	lavaMonsterCollisionHeight,
	obstacleHeightTolerance,
	playerCollisionHeight,
	type World,
} from "../../../world/world";

type LavaMonsterPlacementInput = {
	readonly world: World;
	readonly entity: EntityId;
	readonly position: Position;
	readonly elevation: number;
};

export const canPlaceLavaMonster = ({
	world,
	entity: lavaMonster,
	position,
	elevation,
}: LavaMonsterPlacementInput): boolean => {
	const { floorOrigin, floorPlan } = world;
	if (
		position.x < floorOrigin.x + lavaMonsterBody.width / 2 ||
		position.x > floorOrigin.x + floorPlan.width - lavaMonsterBody.width / 2 ||
		position.y < floorOrigin.y + lavaMonsterBody.depth / 2 ||
		position.y > floorOrigin.y + floorPlan.depth - lavaMonsterBody.depth / 2
	)
		return false;
	for (const entity of world.positions.keys()) {
		if (entity === lavaMonster) continue;
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		const blocksAtElevation = isPlayerEntity(world, entity)
			? verticalRangesOverlap({
					base: elevation,
					height: lavaMonsterCollisionHeight,
					otherBase: world.elevations.get(entity)?.z ?? groundElevation,
					otherHeight: playerCollisionHeight,
				})
			: isSolidEntity(world, entity) &&
				elevation < entityTopElevation(world, entity) - obstacleHeightTolerance;
		if (
			blocksAtElevation &&
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			overlaps({
				position,
				body: lavaMonsterBody,
				otherPosition: obstaclePosition,
				otherBody: obstacleBody,
			})
		)
			return false;
	}
	return true;
};
export const nearestValidLavaMonsterPosition = ({
	world,
	entity: lavaMonster,
	origin,
	elevation,
}: {
	readonly world: World;
	readonly entity: EntityId;
	readonly origin: Position;
	readonly elevation: number;
}): Position | undefined => {
	const minimumX = world.floorOrigin.x + lavaMonsterBody.width / 2,
		maximumX =
			world.floorOrigin.x + world.floorPlan.width - lavaMonsterBody.width / 2,
		minimumY = world.floorOrigin.y + lavaMonsterBody.depth / 2,
		maximumY =
			world.floorOrigin.y + world.floorPlan.depth - lavaMonsterBody.depth / 2;
	const clamp = (value: number, minimum: number, maximum: number): number =>
		Math.min(Math.max(value, minimum), maximum);
	const xs = new Set([clamp(origin.x, minimumX, maximumX), minimumX, maximumX]),
		ys = new Set([clamp(origin.y, minimumY, maximumY), minimumY, maximumY]);
	for (const [entity, position] of world.positions) {
		if (entity === lavaMonster) continue;
		const body = world.bodies.get(entity);
		if (body === undefined) continue;
		const horizontal = (body.width + lavaMonsterBody.width) / 2,
			vertical = (body.depth + lavaMonsterBody.depth) / 2;
		xs.add(clamp(position.x - horizontal, minimumX, maximumX));
		xs.add(clamp(position.x + horizontal, minimumX, maximumX));
		ys.add(clamp(position.y - vertical, minimumY, maximumY));
		ys.add(clamp(position.y + vertical, minimumY, maximumY));
	}
	let nearest: Position | undefined;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const x of xs)
		for (const y of ys) {
			const candidate = { x, y };
			if (
				!canPlaceLavaMonster({
					world,
					entity: lavaMonster,
					position: candidate,
					elevation,
				})
			)
				continue;
			const distance = Math.hypot(x - origin.x, y - origin.y);
			if (distance < nearestDistance) {
				nearest = candidate;
				nearestDistance = distance;
			}
		}
	return nearest;
};
