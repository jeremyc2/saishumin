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
		const canPlaceCrate = (
			world: World,
			crateEntity: EntityId,
			position: Position,
		): boolean => {
			const body = world.bodies.get(crateEntity);
			if (body === undefined) return false;
			if (
				position.x - body.width / 2 < wallThickness ||
				position.x + body.width / 2 > roomWidth - wallThickness ||
				position.y - body.depth / 2 < wallThickness ||
				position.y + body.depth / 2 > roomDepth - wallThickness
			)
				return false;

			for (const entity of world.obstacles.keys()) {
				if (entity === crateEntity) continue;
				const otherPosition = world.positions.get(entity);
				const otherBody = world.bodies.get(entity);
				if (
					otherPosition !== undefined &&
					otherBody !== undefined &&
					overlaps(position, body, otherPosition, otherBody)
				)
					return false;
			}
			return true;
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
				if (
					candidate.x - body.width / 2 < wallThickness ||
					candidate.x + body.width / 2 > roomWidth - wallThickness ||
					candidate.y - body.depth / 2 < wallThickness ||
					candidate.y + body.depth / 2 > roomDepth - wallThickness
				)
					return false;

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
					if (obstacle.kind !== ObstacleKinds.Crate || !visit(otherEntity))
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

			const playerCandidate = {
				x: position.x + weightedDelta.x,
				y: position.y + weightedDelta.y,
			};
			const crateCandidate = {
				x: cratePosition.x + weightedDelta.x,
				y: cratePosition.y + weightedDelta.y,
			};
			if (
				!canPlaceCrate(world, grabbed, crateCandidate) ||
				!canPlacePlayer(world, playerCandidate, elevation, grabbed)
			)
				return { world, position };

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
			const nextPositions = new Map(world.positions);
			for (const entity of pushChain) {
				const cratePosition = world.positions.get(entity);
				if (cratePosition === undefined) return { world, position };
				nextPositions.set(entity, {
					x: cratePosition.x + weightedDelta.x,
					y: cratePosition.y + weightedDelta.y,
				});
			}
			return {
				world: { ...world, positions: nextPositions },
				position: {
					x: position.x + weightedDelta.x,
					y: position.y + weightedDelta.y,
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
