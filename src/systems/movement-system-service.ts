import { Context, Layer } from "effect";
import {
	isPositionInsideRoom,
	isSolidEntity,
	overlaps,
	surfaceAt,
} from "../ecs/collision";
import {
	containsFootprint,
	entityBaseElevation,
	entityHeight,
	entityTopElevation,
	placementElevationForEntity,
	verticalRangesOverlap,
} from "../ecs/elevation";
import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../ecs/player-placement";
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
	stationaryVelocity,
	type World,
} from "../ecs/world";
import {
	DecorationKinds,
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
		const isDirectlyPushableEntity = (
			world: World,
			entity: EntityId,
		): boolean => world.obstacles.get(entity)?.kind === ObstacleKinds.Crate;

		const raisedSupportContact = (
			world: World,
			entity: EntityId,
			position: Position,
			body: { readonly width: number; readonly depth: number },
			movingHorizontally: boolean,
			movingForward: boolean,
		): number | undefined => {
			const baseElevation = entityBaseElevation(world, entity);
			if (baseElevation <= groundElevation + obstacleHeightTolerance)
				return undefined;

			let contact: number | undefined;
			for (const [supportEntity, obstacle] of world.obstacles) {
				if (
					supportEntity === entity ||
					obstacle.kind !== ObstacleKinds.Platform ||
					Math.abs(entityTopElevation(world, supportEntity) - baseElevation) >
						obstacleHeightTolerance
				)
					continue;
				const supportPosition = world.positions.get(supportEntity);
				const supportBody = world.bodies.get(supportEntity);
				if (
					supportPosition === undefined ||
					supportBody === undefined ||
					!containsFootprint(supportPosition, supportBody, position, body)
				)
					continue;

				const center = movingHorizontally ? position.x : position.y;
				const halfExtent = movingHorizontally ? body.width / 2 : body.depth / 2;
				const supportCenter = movingHorizontally
					? supportPosition.x
					: supportPosition.y;
				const supportHalfExtent = movingHorizontally
					? supportBody.width / 2
					: supportBody.depth / 2;
				const nextContact = movingForward
					? supportCenter + supportHalfExtent - halfExtent - center
					: supportCenter - supportHalfExtent + halfExtent - center;
				contact =
					contact === undefined
						? nextContact
						: movingForward
							? Math.max(contact, nextContact)
							: Math.min(contact, nextContact);
			}
			return contact;
		};

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
				const roomExtent = movingHorizontally
					? world.floorPlan.width
					: world.floorPlan.depth;
				const roomContact = movingForward
					? roomExtent - halfExtent - center
					: halfExtent - center;
				allowed = movingForward
					? Math.max(0, Math.min(allowed, roomContact))
					: Math.min(0, Math.max(allowed, roomContact));

				const supportContact = raisedSupportContact(
					world,
					entity,
					position,
					body,
					movingHorizontally,
					movingForward,
				);
				if (supportContact !== undefined) {
					allowed = movingForward
						? Math.max(0, Math.min(allowed, supportContact))
						: Math.min(0, Math.max(allowed, supportContact));
				}

				for (const otherEntity of world.positions.keys()) {
					if (
						crateEntities.has(otherEntity) ||
						!isSolidEntity(world, otherEntity)
					)
						continue;
					const otherPosition = world.positions.get(otherEntity);
					const otherBody = world.bodies.get(otherEntity);
					if (otherPosition === undefined || otherBody === undefined) continue;
					if (
						!verticalRangesOverlap(
							entityBaseElevation(world, entity),
							entityHeight(world, entity),
							entityBaseElevation(world, otherEntity),
							entityHeight(world, otherEntity),
						)
					)
						continue;

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

		const slideOffDecorationTop = (
			world: World,
			position: Position,
			fromElevation: number,
			toElevation: number,
		):
			| { readonly position: Position; readonly elevation: number }
			| undefined => {
			if (toElevation >= fromElevation) return undefined;
			let highestCrossedTop = Number.NEGATIVE_INFINITY;
			for (const [entity, decoration] of world.decorations) {
				if (
					decoration.kind !== DecorationKinds.Plant &&
					decoration.kind !== DecorationKinds.Lamp
				)
					continue;
				const otherPosition = world.positions.get(entity);
				const otherBody = world.bodies.get(entity);
				const top = entityTopElevation(world, entity);
				if (
					otherPosition === undefined ||
					otherBody === undefined ||
					!overlaps(position, playerBody, otherPosition, otherBody) ||
					fromElevation < top - obstacleHeightTolerance ||
					toElevation > top
				)
					continue;
				highestCrossedTop = Math.max(highestCrossedTop, top);
			}
			if (!Number.isFinite(highestCrossedTop)) return undefined;

			const positionBelowTop = nearestValidPlayerPosition(
				world,
				position,
				highestCrossedTop - obstacleHeightTolerance * 2,
			);
			return positionBelowTop === undefined
				? undefined
				: { position: positionBelowTop, elevation: highestCrossedTop };
		};

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
				for (const otherEntity of world.positions.keys()) {
					if (
						otherEntity === entity ||
						chain.has(otherEntity) ||
						!isSolidEntity(world, otherEntity)
					)
						continue;
					const otherPosition = world.positions.get(otherEntity);
					const otherBody = world.bodies.get(otherEntity);
					if (
						otherPosition === undefined ||
						otherBody === undefined ||
						!overlaps(candidate, body, otherPosition, otherBody) ||
						!verticalRangesOverlap(
							entityBaseElevation(world, entity),
							entityHeight(world, entity),
							entityBaseElevation(world, otherEntity),
							entityHeight(world, otherEntity),
						)
					)
						continue;
					if (
						isDirectlyPushableEntity(world, otherEntity) &&
						!visit(otherEntity)
					)
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
			if (!isPositionInsideRoom(world, position)) return false;

			for (const entity of world.positions.keys()) {
				if (entity === ignoredEntity || !isSolidEntity(world, entity)) continue;
				const obstaclePosition = world.positions.get(entity);
				const obstacleBody = world.bodies.get(entity);
				if (
					obstaclePosition !== undefined &&
					obstacleBody !== undefined &&
					overlaps(position, playerBody, obstaclePosition, obstacleBody) &&
					elevation.z <
						entityTopElevation(world, entity) - obstacleHeightTolerance
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
			const nextElevations = new Map(world.elevations);
			nextPositions.set(grabbed, crateCandidate);
			nextElevations.set(grabbed, {
				z: placementElevationForEntity(
					world,
					grabbed,
					crateCandidate,
					world.bodies.get(grabbed) ?? playerBody,
				),
				velocity: stationaryVelocity,
			});
			return {
				world: {
					...world,
					positions: nextPositions,
					elevations: nextElevations,
				},
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
			if (!isPositionInsideRoom(world, fullSpeedCandidate)) {
				return { world, position };
			}
			const supportingHeight = surfaceAt(world, position, playerBody);
			const isSupported =
				elevation.velocity === stationaryVelocity &&
				elevation.z === supportingHeight;
			let pushChain: ReadonlySet<EntityId> | undefined;

			for (const entity of world.positions.keys()) {
				if (!isSolidEntity(world, entity)) continue;
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
					)
				)
					continue;
				if (
					elevation.z >=
					entityTopElevation(world, entity) - obstacleHeightTolerance
				)
					continue;

				if (!isDirectlyPushableEntity(world, entity) || !isSupported) {
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
			const nextElevations = new Map(world.elevations);
			for (const entity of pushChain) {
				const cratePosition = world.positions.get(entity);
				const body = world.bodies.get(entity);
				if (cratePosition === undefined || body === undefined)
					return { world, position };
				const nextPosition = {
					x: cratePosition.x + crateDelta.x,
					y: cratePosition.y + crateDelta.y,
				};
				nextPositions.set(entity, nextPosition);
				nextElevations.set(entity, {
					z: placementElevationForEntity(world, entity, nextPosition, body),
					velocity: stationaryVelocity,
				});
			}
			return {
				world: {
					...world,
					positions: nextPositions,
					elevations: nextElevations,
					pushing: pushChain.values().next().value ?? null,
				},
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
			if (
				elevation.velocity === stationaryVelocity &&
				!isPlayerPlacementValid(world, position, elevation.z)
			) {
				const safePosition = nearestValidPlayerPosition(
					world,
					position,
					elevation.z,
				);
				if (safePosition !== undefined) {
					const safePositions = new Map(world.positions);
					safePositions.set(playerEntity, safePosition);
					return updateMovement(
						{ ...world, positions: safePositions },
						elapsed,
					);
				}
			}

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
			let movedPosition = verticalMove.position;

			let velocity = elevation.velocity - gravity * elapsed;
			let z = elevation.z + velocity * elapsed;
			let nextSurface = surfaceAt(
				verticalMove.world,
				movedPosition,
				playerBody,
			);
			const slipperyTop = slideOffDecorationTop(
				verticalMove.world,
				movedPosition,
				elevation.z,
				z,
			);
			if (slipperyTop !== undefined) {
				movedPosition = slipperyTop.position;
				z = Math.max(z, slipperyTop.elevation);
				nextSurface = surfaceAt(verticalMove.world, movedPosition, playerBody);
			}
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
				if (
					!isPlayerPlacementValid(
						verticalMove.world,
						movedPosition,
						nextSurface,
					)
				) {
					const safePosition = nearestValidPlayerPosition(
						verticalMove.world,
						movedPosition,
						nextSurface,
					);
					if (safePosition !== undefined) {
						movedPosition = safePosition;
						nextSurface = surfaceAt(
							verticalMove.world,
							movedPosition,
							playerBody,
						);
					}
				}
				z = nextSurface;
				velocity = stationaryVelocity;
			}

			if (z < fallResetElevation) {
				const resetPosition = {
					x: Math.min(
						playerSpawnPosition.x,
						verticalMove.world.floorPlan.width,
					),
					y: Math.min(
						playerSpawnPosition.y,
						verticalMove.world.floorPlan.depth,
					),
				};
				const resetPositions = new Map(verticalMove.world.positions);
				resetPositions.set(playerEntity, resetPosition);
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
		return {
			update: (world, elapsed) =>
				updateMovement(
					world.pushing === null ? world : { ...world, pushing: null },
					elapsed,
				),
		};
	});
}
