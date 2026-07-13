import { Context, Layer } from "effect";
import { isPositionInsideRoom, overlaps, surfaceAt } from "../ecs/collision";
import {
	cratePushSlowdown,
	fallResetElevation,
	gravity,
	groundElevation,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	playerSpawnPosition,
	playerSpeed,
	roomDepth,
	roomWidth,
	stationaryVelocity,
	type World,
	wallThickness,
} from "../ecs/world";
import {
	type Elevation,
	ObstacleKinds,
	type Position,
} from "../model/component";
import { Controls } from "../model/control";
import type { EntityId } from "../model/entity-id";

export class MovementSystemService extends Context.Service<
	MovementSystemService,
	{
		readonly update: (world: World, elapsed: number) => World;
	}
>()("saishumin/systems/movement-system-service/MovementSystemService") {
	static readonly layer = Layer.sync(this, () => {
		const clampCrateAxisDelta = (
			world: World,
			crateEntities: ReadonlySet<EntityId>,
			delta: Position,
		): Position => {
			const movingHorizontally = delta.x !== 0;
			const requested = movingHorizontally ? delta.x : delta.y;
			if (requested === 0) return delta;

			let allowed = requested;
			const movingForward = requested > 0;
			for (const entity of crateEntities) {
				const position = world.positions.get(entity);
				const body = world.bodies.get(entity);
				if (position === undefined || body === undefined) {
					return { x: 0, y: 0 };
				}

				const center = movingHorizontally ? position.x : position.y;
				const halfExtent = movingHorizontally ? body.width / 2 : body.depth / 2;
				const roomExtent = movingHorizontally ? roomWidth : roomDepth;
				const roomContact = movingForward
					? roomExtent - wallThickness - halfExtent - center
					: wallThickness + halfExtent - center;
				allowed = movingForward
					? Math.max(0, Math.min(allowed, roomContact))
					: Math.min(0, Math.max(allowed, roomContact));

				for (const otherEntity of world.obstacles.keys()) {
					if (crateEntities.has(otherEntity)) continue;
					const otherPosition = world.positions.get(otherEntity);
					const otherBody = world.bodies.get(otherEntity);
					if (otherPosition === undefined || otherBody === undefined) continue;

					const perpendicularDistance = movingHorizontally
						? Math.abs(position.y - otherPosition.y)
						: Math.abs(position.x - otherPosition.x);
					const perpendicularExtent = movingHorizontally
						? (body.depth + otherBody.depth) / 2
						: (body.width + otherBody.width) / 2;
					if (perpendicularDistance >= perpendicularExtent) continue;

					const otherCenter = movingHorizontally
						? otherPosition.x
						: otherPosition.y;
					const otherHalfExtent = movingHorizontally
						? otherBody.width / 2
						: otherBody.depth / 2;
					const contactDistance = movingForward
						? otherCenter - otherHalfExtent - (center + halfExtent)
						: otherCenter + otherHalfExtent - (center - halfExtent);
					if (
						(movingForward && contactDistance >= 0) ||
						(!movingForward && contactDistance <= 0)
					) {
						allowed = movingForward
							? Math.max(0, Math.min(allowed, contactDistance))
							: Math.min(0, Math.max(allowed, contactDistance));
					}
				}
			}

			return movingHorizontally ? { x: allowed, y: 0 } : { x: 0, y: allowed };
		};

		const crateSpeedFactor = (crateCount: number): number =>
			1 / (1 + crateCount * cratePushSlowdown);

		const collectPushChain = (
			world: World,
			initialCrate: EntityId,
			delta: Position,
		): ReadonlySet<EntityId> | undefined => {
			const chain = new Set<EntityId>();
			const visit = (entity: EntityId): boolean => {
				if (chain.has(entity)) return true;
				chain.add(entity);
				const position = world.positions.get(entity);
				const body = world.bodies.get(entity);
				if (position === undefined || body === undefined) return false;
				const candidate = { x: position.x + delta.x, y: position.y + delta.y };
				for (const [otherEntity, obstacle] of world.obstacles) {
					if (otherEntity === entity || chain.has(otherEntity)) continue;
					const otherPosition = world.positions.get(otherEntity);
					const otherBody = world.bodies.get(otherEntity);
					if (
						otherPosition === undefined ||
						otherBody === undefined ||
						!overlaps(candidate, body, otherPosition, otherBody)
					)
						continue;
					if (obstacle.kind === ObstacleKinds.Crate && !visit(otherEntity))
						return false;
				}
				return true;
			};

			return visit(initialCrate) ? chain : undefined;
		};

		const canPlacePlayer = (
			world: World,
			position: Position,
			elevation: Elevation,
			ignoredEntity: EntityId,
		): boolean => {
			if (!isPositionInsideRoom(position)) return false;

			for (const [entity, obstacle] of world.obstacles) {
				if (entity === ignoredEntity) continue;
				const obstaclePosition = world.positions.get(entity);
				const obstacleBody = world.bodies.get(entity);
				if (
					obstaclePosition !== undefined &&
					obstacleBody !== undefined &&
					overlaps(position, playerBody, obstaclePosition, obstacleBody) &&
					elevation.z < obstacle.height - obstacleHeightTolerance
				)
					return false;
			}
			return true;
		};

		const moveGrabbedAxis = (
			world: World,
			position: Position,
			elevation: Elevation,
			delta: Position,
		): { readonly world: World; readonly position: Position } | undefined => {
			const grabbed = world.grabbed;
			if (grabbed === null) return undefined;
			const cratePosition = world.positions.get(grabbed);
			if (cratePosition === undefined) return { world, position };
			const speedFactor = crateSpeedFactor(1);
			const weightedDelta = {
				x: delta.x * speedFactor,
				y: delta.y * speedFactor,
			};
			const crateDelta = clampCrateAxisDelta(
				world,
				new Set([grabbed]),
				weightedDelta,
			);
			const playerCandidate = {
				x: position.x + crateDelta.x,
				y: position.y + crateDelta.y,
			};
			if (!canPlacePlayer(world, playerCandidate, elevation, grabbed)) {
				return { world, position };
			}
			const crateCandidate = {
				x: cratePosition.x + crateDelta.x,
				y: cratePosition.y + crateDelta.y,
			};

			const nextPositions = new Map(world.positions);
			nextPositions.set(grabbed, crateCandidate);
			return {
				world: { ...world, positions: nextPositions },
				position: playerCandidate,
			};
		};

		const movePlayerAxis = (
			world: World,
			position: Position,
			elevation: Elevation,
			delta: Position,
		): { readonly world: World; readonly position: Position } => {
			const grabbedMove = moveGrabbedAxis(world, position, elevation, delta);
			if (grabbedMove !== undefined) return grabbedMove;
			const fullSpeedCandidate = {
				x: position.x + delta.x,
				y: position.y + delta.y,
			};
			if (!isPositionInsideRoom(fullSpeedCandidate)) {
				return { world, position };
			}
			const supportingHeight = surfaceAt(world, position, playerBody);
			const isSupported =
				elevation.velocity === stationaryVelocity &&
				elevation.z === supportingHeight;
			let pushChain: ReadonlySet<EntityId> | undefined;

			for (const [entity, obstacle] of world.obstacles) {
				const obstaclePosition = world.positions.get(entity);
				const obstacleBody = world.bodies.get(entity);
				if (
					obstaclePosition === undefined ||
					obstacleBody === undefined ||
					!overlaps(
						fullSpeedCandidate,
						playerBody,
						obstaclePosition,
						obstacleBody,
					) ||
					elevation.z >= obstacle.height - obstacleHeightTolerance
				)
					continue;

				if (obstacle.kind !== ObstacleKinds.Crate || !isSupported) {
					return { world, position };
				}

				const singleCrateFactor = crateSpeedFactor(1);
				pushChain = collectPushChain(world, entity, {
					x: delta.x * singleCrateFactor,
					y: delta.y * singleCrateFactor,
				});
				if (pushChain === undefined) return { world, position };
			}

			if (pushChain === undefined) {
				return { world, position: fullSpeedCandidate };
			}

			const speedFactor = crateSpeedFactor(pushChain.size);
			const weightedDelta = {
				x: delta.x * speedFactor,
				y: delta.y * speedFactor,
			};
			const crateDelta = clampCrateAxisDelta(world, pushChain, weightedDelta);
			const nextPositions = new Map(world.positions);
			for (const entity of pushChain) {
				const cratePosition = world.positions.get(entity);
				if (cratePosition === undefined) return { world, position };
				nextPositions.set(entity, {
					x: cratePosition.x + crateDelta.x,
					y: cratePosition.y + crateDelta.y,
				});
			}
			return {
				world: { ...world, positions: nextPositions },
				position: {
					x: position.x + crateDelta.x,
					y: position.y + crateDelta.y,
				},
			};
		};

		const updateMovement = (world: World, elapsed: number): World => {
			const position = world.positions.get(playerEntity);
			const elevation = world.elevations.get(playerEntity);
			if (position === undefined || elevation === undefined) return world;

			const horizontal =
				Number(world.pressed.has(Controls.Right)) -
				Number(world.pressed.has(Controls.Left));
			const vertical =
				Number(world.pressed.has(Controls.Down)) -
				Number(world.pressed.has(Controls.Up));
			const magnitude = Math.hypot(horizontal, vertical);
			const currentSurface = surfaceAt(world, position, playerBody);
			if (elevation.z < currentSurface - obstacleHeightTolerance) {
				const nextElevations = new Map(world.elevations);
				nextElevations.set(playerEntity, {
					z: currentSurface,
					velocity: stationaryVelocity,
				});
				return { ...world, elevations: nextElevations };
			}
			if (
				magnitude === 0 &&
				elevation.velocity === stationaryVelocity &&
				elevation.z === currentSurface
			)
				return world;
			const distance =
				magnitude === 0 ? 0 : (playerSpeed * elapsed) / magnitude;

			const horizontalMove = movePlayerAxis(world, position, elevation, {
				x: horizontal * distance,
				y: 0,
			});
			const verticalMove = movePlayerAxis(
				horizontalMove.world,
				horizontalMove.position,
				elevation,
				{ x: 0, y: vertical * distance },
			);
			const movedPosition = verticalMove.position;

			let velocity = elevation.velocity - gravity * elapsed;
			let z = elevation.z + velocity * elapsed;
			const nextSurface = surfaceAt(
				verticalMove.world,
				movedPosition,
				playerBody,
			);
			const isStanding =
				elevation.velocity === stationaryVelocity &&
				elevation.z === currentSurface;
			if (isStanding && nextSurface === elevation.z) {
				z = nextSurface;
				velocity = stationaryVelocity;
			} else if (
				velocity <= 0 &&
				z <= nextSurface &&
				elevation.z >= nextSurface
			) {
				z = nextSurface;
				velocity = stationaryVelocity;
			}

			if (z < fallResetElevation) {
				const resetPositions = new Map(verticalMove.world.positions);
				resetPositions.set(playerEntity, playerSpawnPosition);
				const resetElevations = new Map(verticalMove.world.elevations);
				resetElevations.set(playerEntity, {
					z: groundElevation,
					velocity: stationaryVelocity,
				});
				return {
					...verticalMove.world,
					positions: resetPositions,
					elevations: resetElevations,
				};
			}

			const nextPositions = new Map(verticalMove.world.positions);
			nextPositions.set(playerEntity, movedPosition);
			const nextElevations = new Map(verticalMove.world.elevations);
			nextElevations.set(playerEntity, { z, velocity });
			return {
				...verticalMove.world,
				positions: nextPositions,
				elevations: nextElevations,
			};
		};
		return { update: updateMovement };
	});
}
