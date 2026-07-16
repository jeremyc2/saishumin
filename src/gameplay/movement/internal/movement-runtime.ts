import { Context, Layer } from "effect";
import { pipe } from "effect/Function";
import { Controls } from "../../../app/control";
import {
	type Body,
	DecorationKinds,
	type Elevation,
	ObstacleKinds,
	type Position,
} from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import {
	isPositionInsideRoom,
	isSolidEntity,
	overlaps,
	surfaceAt,
} from "../../../world/spatial/collision";
import {
	entityBaseElevation,
	entityHeight,
	entityTopElevation,
	placementElevationForEntity,
	verticalRangesOverlap,
} from "../../../world/spatial/elevation";
import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../../../world/spatial/player-placement";
import { isSupportSurfaceOccupied } from "../../../world/spatial/support-surface";
import {
	cratePushSlowdown,
	fallResetElevation,
	gravity,
	groundElevation,
	isPlayerEntity,
	obstacleHeightTolerance,
	playerBody,
	playerCollisionHeight,
	playerEntityIn,
	playerSpawnPosition,
	playerSpeed,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import { updateLavaMonster } from "./lava-monster";
import { updateFallingMovableItems } from "./movable-items";
import { recoverInvalidPlayerPlacement } from "./player-recovery";

export class MovementSystemService extends Context.Service<
	MovementSystemService,
	{
		readonly update: (input: {
			readonly world: World;
			readonly elapsed: number;
		}) => World;
	}
>()(
	"saishumin/gameplay/movement/internal/movement-runtime/MovementSystemService",
) {
	static readonly layer = Layer.sync(this, () => {
		const isDirectlyPushableEntity = (
			world: World,
			entity: EntityId,
		): boolean => world.obstacles.get(entity)?.kind === ObstacleKinds.Crate;

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
				if (isSupportSurfaceOccupied(world, entity, position, body))
					return { x: 0, y: 0 };

				const center = movingHorizontally ? position.x : position.y;
				const halfExtent = movingHorizontally ? body.width / 2 : body.depth / 2;
				const roomExtent = movingHorizontally
					? world.floorPlan.width
					: world.floorPlan.depth;
				const roomOrigin = movingHorizontally
					? world.floorOrigin.x
					: world.floorOrigin.y;
				const roomContact = movingForward
					? roomOrigin + roomExtent - halfExtent - center
					: roomOrigin + halfExtent - center;
				allowed = movingForward
					? Math.max(0, Math.min(allowed, roomContact))
					: Math.min(0, Math.max(allowed, roomContact));

				for (const otherEntity of world.positions.keys()) {
					const otherIsPlayer = isPlayerEntity(world, otherEntity);
					if (
						crateEntities.has(otherEntity) ||
						(!otherIsPlayer && !isSolidEntity(world, otherEntity))
					)
						continue;
					const otherPosition = world.positions.get(otherEntity);
					const otherBody = world.bodies.get(otherEntity);
					if (otherPosition === undefined || otherBody === undefined) continue;
					if (otherIsPlayer) {
						const playerElevation = world.elevations.get(otherEntity)?.z;
						if (
							playerElevation === undefined ||
							playerElevation >=
								entityTopElevation(world, entity) - obstacleHeightTolerance
						)
							continue;
					} else if (
						!verticalRangesOverlap({
							base: entityBaseElevation(world, entity),
							height: entityHeight(world, entity),
							otherBase: entityBaseElevation(world, otherEntity),
							otherHeight: entityHeight(world, otherEntity),
						})
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

		const blocksPlayerMovementAtElevation = (
			world: World,
			entity: EntityId,
			elevation: Elevation,
		): boolean =>
			elevation.z < entityTopElevation(world, entity) - obstacleHeightTolerance;

		const elevationAfterHorizontalMove = (
			world: World,
			entity: EntityId,
			position: Position,
			body: Body,
		): Elevation => {
			const current =
				world.elevations.get(entity) ??
				({ z: groundElevation, velocity: stationaryVelocity } as const);
			const support = placementElevationForEntity(
				world,
				entity,
				position,
				body,
				current.z,
			);
			if (Math.abs(current.z - support) <= obstacleHeightTolerance) {
				return { z: support, velocity: stationaryVelocity };
			}
			if (support > current.z) {
				return { z: support, velocity: stationaryVelocity };
			}
			return {
				z: current.z,
				velocity: Math.min(current.velocity, stationaryVelocity),
			};
		};

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
					!overlaps({ position, body: playerBody, otherPosition, otherBody }) ||
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
						!overlaps({
							position: candidate,
							body,
							otherPosition,
							otherBody,
						}) ||
						!verticalRangesOverlap({
							base: entityBaseElevation(world, entity),
							height: entityHeight(world, entity),
							otherBase: entityBaseElevation(world, otherEntity),
							otherHeight: entityHeight(world, otherEntity),
						})
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
					overlaps({
						position,
						body: playerBody,
						otherPosition: obstaclePosition,
						otherBody: obstacleBody,
					}) &&
					blocksPlayerMovementAtElevation(world, entity, elevation)
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
			nextElevations.set(
				grabbed,
				elevationAfterHorizontalMove(
					world,
					grabbed,
					crateCandidate,
					world.bodies.get(grabbed) ?? playerBody,
				),
			);
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
			const supportingHeight = surfaceAt(
				world,
				position,
				playerBody,
				elevation.z,
			);
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
					!overlaps({
						position: fullSpeedCandidate,
						body: playerBody,
						otherPosition: obstaclePosition,
						otherBody: obstacleBody,
					})
				)
					continue;
				if (!blocksPlayerMovementAtElevation(world, entity, elevation))
					continue;

				if (
					!isDirectlyPushableEntity(world, entity) ||
					!isSupported ||
					elevation.z <
						entityBaseElevation(world, entity) - obstacleHeightTolerance ||
					!verticalRangesOverlap({
						base: elevation.z,
						height: playerCollisionHeight,
						otherBase: entityBaseElevation(world, entity),
						otherHeight: entityHeight(world, entity),
					})
				) {
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
				nextElevations.set(
					entity,
					elevationAfterHorizontalMove(world, entity, nextPosition, body),
				);
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
			const playerEntity = playerEntityIn(world);
			if (playerEntity === undefined) return world;
			const position = world.positions.get(playerEntity);
			const elevation = world.elevations.get(playerEntity);
			if (position === undefined || elevation === undefined) return world;
			const relocated = recoverInvalidPlayerPlacement(world);
			if (relocated !== world) return updateMovement(relocated, elapsed);

			const horizontal =
				Number(world.pressed.has(Controls.Right)) -
				Number(world.pressed.has(Controls.Left));
			const vertical =
				Number(world.pressed.has(Controls.Down)) -
				Number(world.pressed.has(Controls.Up));
			const magnitude = Math.hypot(horizontal, vertical);
			const currentSurface = surfaceAt(
				world,
				position,
				playerBody,
				elevation.z,
			);
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
			if (velocity > stationaryVelocity) {
				let ceiling = Number.POSITIVE_INFINITY;
				for (const entity of verticalMove.world.positions.keys()) {
					if (!isSolidEntity(verticalMove.world, entity)) continue;
					const obstaclePosition = verticalMove.world.positions.get(entity);
					const obstacleBody = verticalMove.world.bodies.get(entity);
					const obstacleBase = entityBaseElevation(verticalMove.world, entity);
					if (
						obstaclePosition !== undefined &&
						obstacleBody !== undefined &&
						elevation.z < obstacleBase &&
						z + playerCollisionHeight >= obstacleBase &&
						overlaps({
							position: movedPosition,
							body: playerBody,
							otherPosition: obstaclePosition,
							otherBody: obstacleBody,
						})
					)
						ceiling = Math.min(ceiling, obstacleBase);
				}
				if (Number.isFinite(ceiling)) {
					z = ceiling - playerCollisionHeight;
					velocity = stationaryVelocity;
				}
			}
			let nextSurface = surfaceAt(
				verticalMove.world,
				movedPosition,
				playerBody,
				elevation.z,
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
				nextSurface = surfaceAt(
					verticalMove.world,
					movedPosition,
					playerBody,
					elevation.z,
				);
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
							elevation.z,
						);
					}
				}
				z = nextSurface;
				velocity = stationaryVelocity;
			}

			if (z < fallResetElevation) {
				const resetPosition = {
					x: Math.min(
						Math.max(playerSpawnPosition.x, verticalMove.world.floorOrigin.x),
						verticalMove.world.floorOrigin.x +
							verticalMove.world.floorPlan.width,
					),
					y: Math.min(
						Math.max(playerSpawnPosition.y, verticalMove.world.floorOrigin.y),
						verticalMove.world.floorOrigin.y +
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
			update: ({ world, elapsed }) =>
				pipe(
					updateMovement(
						world.pushing === null ? world : { ...world, pushing: null },
						elapsed,
					),
					updateFallingMovableItems(elapsed),
					updateLavaMonster(elapsed),
					recoverInvalidPlayerPlacement,
				),
		};
	});
}
