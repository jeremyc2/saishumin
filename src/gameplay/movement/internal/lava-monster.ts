import { dual } from "effect/Function";
import type { PlayerFacing, Position } from "../../../world/components";
import { PlayerFacings } from "../../../world/components";
import { surfaceAt } from "../../../world/spatial/collision";
import {
	gravity,
	groundElevation,
	jumpSpeed,
	lavaMonsterBody,
	lavaMonsterEntity,
	lavaMonsterFollowDistance,
	lavaMonsterSpawnPosition,
	lavaMonsterSpeed,
	obstacleHeightTolerance,
	playerEntity,
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

export const updateLavaMonster = dual<
	(elapsed: number) => (self: World) => World,
	(self: World, elapsed: number) => World
>(2, (world: World, elapsed: number): World => {
	const position = world.positions.get(lavaMonsterEntity),
		playerPosition = world.positions.get(playerEntity),
		elevation = world.elevations.get(lavaMonsterEntity);
	if (
		position === undefined ||
		playerPosition === undefined ||
		elevation === undefined
	)
		return world;
	if (!canPlaceLavaMonster({ world, position, elevation: elevation.z })) {
		const safePosition = nearestValidLavaMonsterPosition({
			world,
			origin: position,
			elevation: elevation.z,
		});
		if (safePosition !== undefined)
			return updateLavaMonster(
				{
					...world,
					positions: new Map(world.positions).set(
						lavaMonsterEntity,
						safePosition,
					),
				},
				elapsed,
			);
		if (
			elevation.velocity !== stationaryVelocity ||
			!canPlaceLavaMonster({
				world,
				position: lavaMonsterSpawnPosition,
				elevation: groundElevation,
			})
		)
			return world;
		return {
			...world,
			positions: new Map(world.positions).set(
				lavaMonsterEntity,
				lavaMonsterSpawnPosition,
			),
			elevations: new Map(world.elevations).set(lavaMonsterEntity, {
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
			position,
			elevation: elevation.z,
			target: playerPosition,
		});
	const direction = lavaMonsterDirection({
		world,
		position,
		target: playerPosition,
		elevation: elevation.z,
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
		position: verticalCandidate,
		elevation: elevation.z,
	})
		? verticalCandidate
		: afterHorizontal;
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
		positions: new Map(world.positions).set(lavaMonsterEntity, moved),
		elevations: new Map(world.elevations).set(lavaMonsterEntity, {
			z,
			velocity,
		}),
		lavaMonsterFacing: facingFor(
			{ x: moved.x - position.x, y: moved.y - position.y },
			world.lavaMonsterFacing,
		),
	};
});
