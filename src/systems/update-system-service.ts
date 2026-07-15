import { Context, Effect, Layer } from "effect";
import { updateDesignStudio } from "../design-studio/design-studio";
import { Action } from "../model/action";
import { Controls, type Direction, isDirection } from "../model/control";
import { playerFacingForDirections } from "../model/player-facing";
import { followCamera } from "../rendering/geometry/projection";
import {
	DecorationKinds,
	ObstacleKinds,
	PlayerFacings,
	type Position,
} from "../world/components";
import type { EntityId as EntityIdType } from "../world/entity-id";
import { surfaceAt } from "../world/spatial/collision";
import { entityBaseElevation } from "../world/spatial/elevation";
import {
	crateGrabDistance,
	groundElevation,
	interactionDistance,
	jumpSpeed,
	maximumFrameElapsedSeconds,
	millisecondsPerSecond,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../world/world";
import { MovementSystemService } from "../gameplay/movement/movement-system";

const cameraFollowingPlayer = (world: World, camera: Position): Position => {
	const position = world.positions.get(playerEntity);
	const elevation = world.elevations.get(playerEntity);
	return position === undefined
		? camera
		: followCamera(camera, position, elevation?.z ?? groundElevation);
};

export class UpdateSystemService extends Context.Service<
	UpdateSystemService,
	{
		readonly update: (world: World, action: Action) => World;
	}
>()("saishumin/systems/update-system-service/UpdateSystemService") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			const movementSystem = yield* MovementSystemService;
			const interactableInFrontOfPlayer = (
				world: World,
				isInteractable: (entity: EntityIdType) => boolean,
			): EntityIdType | null => {
				const playerPosition = world.positions.get(playerEntity);
				const playerElevation = world.elevations.get(playerEntity);
				if (
					playerPosition === undefined ||
					playerElevation === undefined ||
					playerElevation.velocity !== stationaryVelocity ||
					world.playerFacing !== PlayerFacings.Up
				)
					return null;
				for (const [entity, objectPosition] of world.positions) {
					if (!isInteractable(entity)) continue;
					const objectBody = world.bodies.get(entity);
					if (
						objectBody === undefined ||
						Math.abs(entityBaseElevation(world, entity) - playerElevation.z) >
							obstacleHeightTolerance
					)
						continue;
					const horizontalOverlap =
						Math.abs(playerPosition.x - objectPosition.x) <
						(playerBody.width + objectBody.width) / 2;
					const frontGap =
						playerPosition.y -
						playerBody.depth / 2 -
						(objectPosition.y + objectBody.depth / 2);
					if (
						horizontalOverlap &&
						frontGap >= 0 &&
						frontGap <= interactionDistance
					)
						return entity;
				}
				return null;
			};
			const nearestGrabbableObject = (world: World): EntityIdType | null => {
				const playerPosition = world.positions.get(playerEntity);
				const elevation = world.elevations.get(playerEntity);
				if (
					playerPosition === undefined ||
					elevation === undefined ||
					elevation.velocity !== stationaryVelocity
				)
					return null;
				let nearest: EntityIdType | null = null;
				let nearestDistance = Number.POSITIVE_INFINITY;
				for (const [entity, objectPosition] of world.positions) {
					const obstacle = world.obstacles.get(entity);
					const decoration = world.decorations.get(entity);
					const isGrabbable =
						obstacle?.kind === ObstacleKinds.Crate ||
						decoration?.kind === DecorationKinds.Plant ||
						decoration?.kind === DecorationKinds.Lamp;
					if (
						!isGrabbable ||
						(world.elevations.get(entity)?.velocity ?? stationaryVelocity) !==
							stationaryVelocity ||
						Math.abs(entityBaseElevation(world, entity) - elevation.z) >
							obstacleHeightTolerance
					)
						continue;
					const distance = Math.hypot(
						objectPosition.x - playerPosition.x,
						objectPosition.y - playerPosition.y,
					);
					if (distance <= crateGrabDistance && distance < nearestDistance) {
						nearest = entity;
						nearestDistance = distance;
					}
				}
				return nearest;
			};
			return {
				update: (world: World, action: Action): World =>
					Action.$match(action, {
						KeyChanged: ({ key, pressed }) => {
							if (world.readingSign !== null)
								return key === Controls.Interact && pressed
									? { ...world, readingSign: null }
									: world;
							if (world.editor.open) return world;
							if (key === Controls.Interact) {
								if (!pressed) return world;
								const chest = interactableInFrontOfPlayer(
									world,
									(entity) =>
										world.obstacles.get(entity)?.kind === ObstacleKinds.Chest,
								);
								if (chest !== null) {
									const openedChests = new Set(world.openedChests);
									if (openedChests.has(chest)) openedChests.delete(chest);
									else openedChests.add(chest);
									return { ...world, openedChests };
								}
								const sign = interactableInFrontOfPlayer(
									world,
									(entity) =>
										world.decorations.get(entity)?.kind ===
										DecorationKinds.Sign,
								);
								return sign === null
									? world
									: {
											...world,
											pressed: new Set<Direction>(),
											grabbed: null,
											pushing: null,
											readingSign: sign,
										};
							}
							if (key === Controls.Grab)
								return {
									...world,
									grabbed: pressed ? nearestGrabbableObject(world) : null,
									pushing: null,
								};
							if (key === Controls.Jump) {
								const elevation = world.elevations.get(playerEntity);
								const position = world.positions.get(playerEntity);
								if (
									!pressed ||
									elevation === undefined ||
									position === undefined
								)
									return world;
								const surface = surfaceAt(
									world,
									position,
									playerBody,
									elevation.z,
								);
								if (
									elevation.velocity !== stationaryVelocity ||
									elevation.z !== surface
								)
									return world;
								const elevations = new Map(world.elevations);
								elevations.set(playerEntity, {
									z: elevation.z,
									velocity: jumpSpeed,
								});
								return { ...world, elevations, grabbed: null, pushing: null };
							}
							if (!isDirection(key)) return world;
							const nextPressed = new Set(world.pressed);
							if (pressed) nextPressed.add(key);
							else nextPressed.delete(key);
							return {
								...world,
								pressed: nextPressed,
								playerFacing: playerFacingForDirections(
									nextPressed,
									world.playerFacing,
								),
								pushing: null,
							};
						},
						Tick: ({ time }) => {
							if (world.editor.open || world.readingSign !== null)
								return { ...world, lastFrame: time };
							if (world.lastFrame === 0) return { ...world, lastFrame: time };
							const elapsed = Math.min(
								(time - world.lastFrame) / millisecondsPerSecond,
								maximumFrameElapsedSeconds,
							);
							const moved = movementSystem.update(world, elapsed);
							return {
								...moved,
								gameCamera: cameraFollowingPlayer(moved, world.gameCamera),
								lastFrame: time,
							};
						},
						EditorToggled: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorSelectionChanged: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEditSessionBegan: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEditSessionPreviewed: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEditSessionAutoPanned: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEditSessionCommitted: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEditSessionCancelled: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorItemAdded: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEntityMoved: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEntityResized: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorEntityHeightChanged: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorSignContentChanged: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorFloorResized: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorCameraChanged: (editorAction) =>
							updateDesignStudio(world, editorAction),
						EditorInvalidPlacementDismissed: (editorAction) =>
							updateDesignStudio(world, editorAction),
						SignDismissed: () =>
							world.readingSign === null
								? world
								: { ...world, readingSign: null },
						EditorDeleteSelected: (editorAction) =>
							updateDesignStudio(world, editorAction),
					}),
			};
		}),
	);
}
