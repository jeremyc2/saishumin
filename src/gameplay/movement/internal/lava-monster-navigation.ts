import type { Position } from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import {
	isSolidEntity,
	overlaps,
	supportSurfaceAt,
} from "../../../world/spatial/collision";
import { entityTopElevation } from "../../../world/spatial/elevation";
import {
	gravity,
	groundElevation,
	isPlayerEntity,
	jumpSpeed,
	lavaMonsterBody,
	lavaMonsterFollowDistance,
	lavaMonsterSpeed,
	obstacleHeightTolerance,
	type World,
} from "../../../world/world";
import { canPlaceLavaMonster } from "./lava-monster-placement";
import { findGridPath } from "./navigation";

const navigationGridSize = 28;
const jumpForesightStep = 0.05;
const minimumRetainedHeadingAlignment = Math.cos(Math.PI / 8);
type LavaMonsterNavigationInput = {
	readonly world: World;
	readonly entity: EntityId;
	readonly position: Position;
	readonly target: Position;
	readonly elevation: number;
	readonly preferredDirection?: Position;
};

export const lavaMonsterDirection = ({
	world,
	entity: lavaMonster,
	position,
	target,
	elevation,
	preferredDirection,
}: LavaMonsterNavigationInput): Position => {
	const offset = { x: target.x - position.x, y: target.y - position.y };
	const distance = Math.hypot(offset.x, offset.y);
	if (distance <= lavaMonsterFollowDistance) return { x: 0, y: 0 };
	const direct = { x: offset.x / distance, y: offset.y / distance };
	const directionWithHysteresis = (
		candidate: Position,
		retainOppositeHeading = true,
	): Position => {
		if (preferredDirection === undefined) return candidate;
		const preferredMagnitude = Math.hypot(
			preferredDirection.x,
			preferredDirection.y,
		);
		if (preferredMagnitude === 0) return candidate;
		const preferred = {
			x: preferredDirection.x / preferredMagnitude,
			y: preferredDirection.y / preferredMagnitude,
		};
		const alignment = candidate.x * preferred.x + candidate.y * preferred.y;
		if (
			alignment >= minimumRetainedHeadingAlignment ||
			(!retainOppositeHeading && alignment <= 0)
		)
			return candidate;
		const preferredCandidate = {
			x: position.x + preferred.x * navigationGridSize,
			y: position.y + preferred.y * navigationGridSize,
		};
		return canPlaceLavaMonster({
			world,
			entity: lavaMonster,
			position: preferredCandidate,
			elevation,
		})
			? preferred
			: candidate;
	};
	if (
		canPlaceLavaMonster({
			world,
			entity: lavaMonster,
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
		return directionWithHysteresis(direct, false);
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
					entity: lavaMonster,
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
			canPlaceLavaMonster({
				world,
				entity: lavaMonster,
				position: candidate,
				elevation,
			}),
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
					entity: lavaMonster,
					position: {
						x: position.x + wander.x * navigationGridSize,
						y: position.y + wander.y * navigationGridSize,
					},
					elevation,
				})
			)
				return directionWithHysteresis(wander);
		return { x: 0, y: 0 };
	}
	const waypointOffset = {
		x: waypoint.x - position.x,
		y: waypoint.y - position.y,
	};
	const magnitude = Math.hypot(waypointOffset.x, waypointOffset.y);
	return directionWithHysteresis({
		x: waypointOffset.x / magnitude,
		y: waypointOffset.y / magnitude,
	});
};
export const lavaMonsterNeedsJump = ({
	world,
	entity: lavaMonster,
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
	const direction = { x: offset.x / distance, y: offset.y / distance };
	const maximumTravel = Math.max(0, distance - lavaMonsterFollowDistance);
	const canCompleteJumpPast = (blocker: EntityId): boolean => {
		const blockerPosition = world.positions.get(blocker);
		const blockerBody = world.bodies.get(blocker);
		if (blockerPosition === undefined || blockerBody === undefined)
			return false;
		const blockerDistance =
			(blockerPosition.x - position.x) * direction.x +
			(blockerPosition.y - position.y) * direction.y;
		const blockerRadius =
			(Math.abs(direction.x) * (blockerBody.width + lavaMonsterBody.width)) /
				2 +
			(Math.abs(direction.y) * (blockerBody.depth + lavaMonsterBody.depth)) / 2;
		const requiredProgress = blockerDistance + blockerRadius;
		let simulatedPosition = position;
		let simulatedElevation = elevation;
		let velocity = jumpSpeed;
		let progress = 0;
		const maximumSteps = Math.ceil(
			(2 * jumpSpeed) / gravity / jumpForesightStep,
		);
		for (let step = 0; step <= maximumSteps; step += 1) {
			const travel = Math.min(
				lavaMonsterSpeed * jumpForesightStep,
				Math.max(0, maximumTravel - progress),
			);
			const delta = { x: direction.x * travel, y: direction.y * travel };
			const horizontalCandidate = {
				x: simulatedPosition.x + delta.x,
				y: simulatedPosition.y,
			};
			const afterHorizontal = canPlaceLavaMonster({
				world,
				entity: lavaMonster,
				position: horizontalCandidate,
				elevation: simulatedElevation,
			})
				? horizontalCandidate
				: simulatedPosition;
			const verticalCandidate = {
				x: afterHorizontal.x,
				y: afterHorizontal.y + delta.y,
			};
			const moved = canPlaceLavaMonster({
				world,
				entity: lavaMonster,
				position: verticalCandidate,
				elevation: simulatedElevation,
			})
				? verticalCandidate
				: afterHorizontal;
			progress =
				(moved.x - position.x) * direction.x +
				(moved.y - position.y) * direction.y;
			velocity -= gravity * jumpForesightStep;
			const nextElevation = simulatedElevation + velocity * jumpForesightStep;
			const support = supportSurfaceAt(
				world,
				moved,
				lavaMonsterBody,
				Math.max(simulatedElevation, nextElevation),
			);
			if (
				velocity <= 0 &&
				nextElevation <= support.elevation &&
				simulatedElevation >= support.elevation
			)
				return (
					support.entity === blocker ||
					(support.elevation === elevation && progress >= requiredProgress)
				);
			simulatedPosition = moved;
			simulatedElevation = nextElevation;
			if (travel <= 0 && simulatedElevation < groundElevation) return false;
		}
		return false;
	};
	for (const entity of world.positions.keys()) {
		if (
			isPlayerEntity(world, entity) ||
			entity === lavaMonster ||
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
			overlaps({
				position: probe,
				body: lavaMonsterBody,
				otherPosition: obstaclePosition,
				otherBody: obstacleBody,
			}) &&
			canCompleteJumpPast(entity)
		)
			return true;
	}
	return false;
};
