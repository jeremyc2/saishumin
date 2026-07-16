import { dual } from "effect/Function";
import type { PlayerFacing, Position } from "../../../world/components";
import { LavaMonsterSteering, PlayerFacings } from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import { surfaceAt } from "../../../world/spatial/collision";
import {
	gravity,
	groundElevation,
	jumpSpeed,
	lavaMonsterBody,
	lavaMonsterEntitiesIn,
	lavaMonsterFollowDistance,
	lavaMonsterSpawnPosition,
	lavaMonsterSpeed,
	obstacleHeightTolerance,
	playerEntityIn,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import {
	lavaMonsterDirection,
	lavaMonsterNeedsJump,
} from "./lava-monster-navigation";
import {
	canPlaceLavaMonster,
	nearestValidLavaMonsterPosition,
} from "./lava-monster-placement";

const facingFor = (delta: Position, previous: PlayerFacing): PlayerFacing => {
	const horizontal = Math.sign(delta.x);
	const vertical = Math.sign(delta.y);
	if (vertical < 0) {
		if (horizontal < 0) return PlayerFacings.UpLeft;
		if (horizontal > 0) return PlayerFacings.UpRight;
		return PlayerFacings.Up;
	}
	if (vertical > 0) {
		if (horizontal < 0) return PlayerFacings.DownLeft;
		if (horizontal > 0) return PlayerFacings.DownRight;
		return PlayerFacings.Down;
	}
	if (horizontal < 0) return PlayerFacings.Left;
	return horizontal > 0 ? PlayerFacings.Right : previous;
};

const diagonalDirection = Math.SQRT1_2;
const minimumFacingCommitDuration = 0.12;
const directionForFacing: Record<PlayerFacing, Position> = {
	up: { x: 0, y: -1 },
	"up-right": { x: diagonalDirection, y: -diagonalDirection },
	right: { x: 1, y: 0 },
	"down-right": { x: diagonalDirection, y: diagonalDirection },
	down: { x: 0, y: 1 },
	"down-left": { x: -diagonalDirection, y: diagonalDirection },
	left: { x: -1, y: 0 },
	"up-left": { x: -diagonalDirection, y: -diagonalDirection },
};

const updateOneLavaMonster = (
	world: World,
	elapsed: number,
	entity: EntityId,
): World => {
	const playerEntity = playerEntityIn(world);
	if (playerEntity === undefined) return world;
	const position = world.positions.get(entity),
		playerPosition = world.positions.get(playerEntity),
		elevation = world.elevations.get(entity),
		character = world.characters.get(entity);
	if (
		position === undefined ||
		playerPosition === undefined ||
		elevation === undefined ||
		character === undefined
	)
		return world;
	const previousSteering = world.lavaMonsterSteering.get(entity);
	if (
		!canPlaceLavaMonster({ world, entity, position, elevation: elevation.z })
	) {
		const safePosition = nearestValidLavaMonsterPosition({
			world,
			entity,
			origin: position,
			elevation: elevation.z,
		});
		if (safePosition !== undefined)
			return updateOneLavaMonster(
				{
					...world,
					positions: new Map(world.positions).set(entity, safePosition),
				},
				elapsed,
				entity,
			);
		if (
			elevation.velocity !== stationaryVelocity ||
			!canPlaceLavaMonster({
				world,
				entity,
				position: lavaMonsterSpawnPosition,
				elevation: groundElevation,
			})
		)
			return world;
		return {
			...world,
			positions: new Map(world.positions).set(entity, lavaMonsterSpawnPosition),
			elevations: new Map(world.elevations).set(entity, {
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
		};
	}
	const currentSurface = surfaceAt(
		world,
		position,
		lavaMonsterBody,
		elevation.z,
	);
	const grounded =
		elevation.velocity === stationaryVelocity &&
		Math.abs(elevation.z - currentSurface) <= obstacleHeightTolerance;
	const shouldJump =
		grounded &&
		lavaMonsterNeedsJump({
			world,
			entity,
			position,
			elevation: elevation.z,
			target: playerPosition,
		});
	const direction = lavaMonsterDirection({
		world,
		entity,
		position,
		target: playerPosition,
		elevation: elevation.z,
		preferredDirection:
			directionForFacing[previousSteering?.candidateFacing ?? character.facing],
	});
	const targetDistance = Math.hypot(
		playerPosition.x - position.x,
		playerPosition.y - position.y,
	);
	const distance = Math.min(
		lavaMonsterSpeed * elapsed,
		Math.max(0, targetDistance - lavaMonsterFollowDistance),
	);
	const delta = { x: direction.x * distance, y: direction.y * distance };
	const horizontalCandidate = { x: position.x + delta.x, y: position.y };
	const afterHorizontal = canPlaceLavaMonster({
		world,
		entity,
		position: horizontalCandidate,
		elevation: elevation.z,
	})
		? horizontalCandidate
		: position;
	const verticalCandidate = {
		x: afterHorizontal.x,
		y: afterHorizontal.y + delta.y,
	};
	const moved = canPlaceLavaMonster({
		world,
		entity,
		position: verticalCandidate,
		elevation: elevation.z,
	})
		? verticalCandidate
		: afterHorizontal;
	const movedDelta = { x: moved.x - position.x, y: moved.y - position.y };
	const facingDirection =
		movedDelta.x === 0 && movedDelta.y === 0 ? movedDelta : direction;
	const desiredFacing = facingFor(facingDirection, character.facing);
	const candidateDuration =
		previousSteering?.candidateFacing === desiredFacing
			? previousSteering.duration + elapsed
			: elapsed;
	const lavaMonsterSteering = new Map(world.lavaMonsterSteering);
	let facing = character.facing;
	if (desiredFacing === character.facing) lavaMonsterSteering.delete(entity);
	else if (candidateDuration >= minimumFacingCommitDuration) {
		facing = desiredFacing;
		lavaMonsterSteering.delete(entity);
	} else
		lavaMonsterSteering.set(
			entity,
			LavaMonsterSteering.make({
				candidateFacing: desiredFacing,
				duration: candidateDuration,
			}),
		);
	let velocity =
		(shouldJump ? jumpSpeed : elevation.velocity) - gravity * elapsed;
	let z = elevation.z + velocity * elapsed;
	const nextSurface = surfaceAt(
		world,
		moved,
		lavaMonsterBody,
		Math.max(elevation.z, z),
	);
	if (!shouldJump && grounded && nextSurface === elevation.z) {
		z = nextSurface;
		velocity = stationaryVelocity;
	} else if (
		velocity <= stationaryVelocity &&
		z <= nextSurface &&
		elevation.z >= nextSurface
	) {
		z = nextSurface;
		velocity = stationaryVelocity;
	}
	return {
		...world,
		positions: new Map(world.positions).set(entity, moved),
		elevations: new Map(world.elevations).set(entity, {
			z,
			velocity,
		}),
		characters: new Map(world.characters).set(entity, {
			...character,
			facing,
		}),
		lavaMonsterSteering,
	};
};

export const updateLavaMonster = dual<
	(elapsed: number) => (self: World) => World,
	(self: World, elapsed: number) => World
>(2, (world: World, elapsed: number): World => {
	let updated = world;
	for (const entity of lavaMonsterEntitiesIn(world))
		updated = updateOneLavaMonster(updated, elapsed, entity);
	return updated;
});
