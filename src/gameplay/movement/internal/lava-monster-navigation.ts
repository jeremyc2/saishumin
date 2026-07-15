import type { Position } from "../../../world/components";
import { isSolidEntity, overlaps } from "../../../world/spatial/collision";
import { entityTopElevation } from "../../../world/spatial/elevation";
import {
	gravity,
	jumpSpeed,
	lavaMonsterBody,
	lavaMonsterEntity,
	lavaMonsterFollowDistance,
	obstacleHeightTolerance,
	playerEntity,
	type World,
} from "../../../world/world";
import { canPlaceLavaMonster } from "./lava-monster-placement";
import { findGridPath } from "./navigation";

const navigationGridSize = 28;
type LavaMonsterNavigationInput = {
	readonly world: World;
	readonly position: Position;
	readonly target: Position;
	readonly elevation: number;
};

export const lavaMonsterDirection = ({
	world,
	position,
	target,
	elevation,
}: LavaMonsterNavigationInput): Position => {
	const offset = { x: target.x - position.x, y: target.y - position.y };
	const distance = Math.hypot(offset.x, offset.y);
	if (distance <= lavaMonsterFollowDistance) return { x: 0, y: 0 };
	const direct = { x: offset.x / distance, y: offset.y / distance };
	if (
		canPlaceLavaMonster({
			world,
			position: {
				x:
					position.x +
					direct.x *
						Math.min(navigationGridSize, distance - lavaMonsterFollowDistance),
				y:
					position.y +
					direct.y *
						Math.min(navigationGridSize, distance - lavaMonsterFollowDistance),
			},
			elevation,
		})
	)
		return direct;
	const hasClearSegment = (destination: Position): boolean => {
		const segment = {
			x: destination.x - position.x,
			y: destination.y - position.y,
		};
		const steps = Math.max(
			1,
			Math.ceil(Math.hypot(segment.x, segment.y) / (navigationGridSize / 3)),
		);
		for (let step = 1; step <= steps; step += 1)
			if (
				!canPlaceLavaMonster({
					world,
					position: {
						x: position.x + (segment.x * step) / steps,
						y: position.y + (segment.y * step) / steps,
					},
					elevation,
				})
			)
				return false;
		return true;
	};
	const path = findGridPath({
		origin: position,
		target,
		arrivalDistance: lavaMonsterFollowDistance,
		spacing: navigationGridSize,
		maximumColumns: Math.ceil(world.floorPlan.width / navigationGridSize) + 1,
		maximumRows: Math.ceil(world.floorPlan.depth / navigationGridSize) + 1,
		canOccupy: (candidate) =>
			canPlaceLavaMonster({ world, position: candidate, elevation }),
	});
	let waypoint = path[0];
	for (const pathPosition of path) {
		if (!hasClearSegment(pathPosition)) break;
		waypoint = pathPosition;
	}
	if (waypoint === undefined) {
		for (const wander of [
			{ x: -direct.y, y: direct.x },
			{ x: direct.y, y: -direct.x },
			{ x: -direct.x, y: -direct.y },
		])
			if (
				canPlaceLavaMonster({
					world,
					position: {
						x: position.x + wander.x * navigationGridSize,
						y: position.y + wander.y * navigationGridSize,
					},
					elevation,
				})
			)
				return wander;
		return { x: 0, y: 0 };
	}
	const waypointOffset = {
		x: waypoint.x - position.x,
		y: waypoint.y - position.y,
	};
	const magnitude = Math.hypot(waypointOffset.x, waypointOffset.y);
	return { x: waypointOffset.x / magnitude, y: waypointOffset.y / magnitude };
};
export const lavaMonsterNeedsJump = ({
	world,
	position,
	elevation,
	target,
}: LavaMonsterNavigationInput): boolean => {
	const offset = { x: target.x - position.x, y: target.y - position.y };
	const distance = Math.hypot(offset.x, offset.y);
	if (distance === 0) return false;
	const probe = {
		x:
			position.x +
			(offset.x / distance) * Math.min(navigationGridSize, distance),
		y:
			position.y +
			(offset.y / distance) * Math.min(navigationGridSize, distance),
	};
	const maximumJumpRise = (jumpSpeed * jumpSpeed) / (2 * gravity);
	for (const entity of world.positions.keys()) {
		if (
			entity === playerEntity ||
			entity === lavaMonsterEntity ||
			!isSolidEntity(world, entity)
		)
			continue;
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		const obstacleTop = entityTopElevation(world, entity);
		if (
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			obstacleTop > elevation + obstacleHeightTolerance &&
			obstacleTop <= elevation + maximumJumpRise &&
			overlaps({
				position: probe,
				body: lavaMonsterBody,
				otherPosition: obstaclePosition,
				otherBody: obstacleBody,
			})
		)
			return true;
	}
	return false;
};
