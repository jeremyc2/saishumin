import { Context, Effect, Layer } from "effect";
import { Action } from "../../app/action";
import { Controls, type Direction, isDirection } from "../../app/control";
import { updateDesignStudio } from "../../design-studio/design-studio";
import { DecorationKinds, ObstacleKinds } from "../../world/components";
import type { EntityId as EntityIdType } from "../../world/entity-id";
import { surfaceAt } from "../../world/spatial/collision";
import { contextualInteractionTarget } from "../../world/spatial/contextual-interaction";
import { entityBaseElevation } from "../../world/spatial/elevation";
import {
	crateGrabDistance,
	jumpSpeed,
	maximumFrameElapsedSeconds,
	millisecondsPerSecond,
	obstacleHeightTolerance,
	playerBody,
	playerEntityIn,
	stationaryVelocity,
	type World,
} from "../../world/world";
import { MovementSystemService } from "../movement/movement-system";
import { playerFacingForDirections } from "./internal/player-facing";

export class UpdateSystemService extends Context.Service<
	UpdateSystemService,
	{
		readonly update: (input: {
			readonly world: World;
			readonly action: Action;
		}) => World;
	}
>()("saishumin/gameplay/update/update-system/UpdateSystemService") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			const movementSystem = yield* MovementSystemService;
			const nearestGrabbableObject = (world: World): EntityIdType | null => {
				const playerEntity = playerEntityIn(world);
				if (playerEntity === undefined) return null;
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
			const interact = (world: World): World => {
				const target = contextualInteractionTarget(world);
				if (target === null) return world;
				if (target.kind === "chest") {
					const openedChests = new Set(world.openedChests);
					if (openedChests.has(target.entity))
						openedChests.delete(target.entity);
					else openedChests.add(target.entity);
					return { ...world, openedChests };
				}
				return {
					...world,
					pressed: new Set<Direction>(),
					grabbed: null,
					pushing: null,
					readingSign: target.entity,
				};
			};
			return {
				update: ({ world, action }): World =>
					Action.$match(action, {
						KeyChanged: ({ key, pressed }) => {
							if (world.readingSign !== null) {
								if (key === Controls.Interact && pressed)
									return { ...world, readingSign: null };
								if (key === Controls.ContextAction && !pressed)
									return { ...world, readingSign: null };
								return world;
							}
							if (world.editor.open) return world;
							if (key === Controls.Interact) {
								if (!pressed) return world;
								return interact(world);
							}
							if (key === Controls.ContextAction) {
								if (pressed) {
									const grabbed = nearestGrabbableObject(world);
									return grabbed === null
										? world
										: { ...world, grabbed, pushing: null };
								}
								if (world.grabbed !== null)
									return { ...world, grabbed: null, pushing: null };
								return interact(world);
							}
							if (key === Controls.Grab)
								return {
									...world,
									grabbed: pressed ? nearestGrabbableObject(world) : null,
									pushing: null,
								};
							if (key === Controls.Jump) {
								const playerEntity = playerEntityIn(world);
								if (playerEntity === undefined) return world;
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
							const playerEntity = playerEntityIn(world);
							if (playerEntity === undefined) return world;
							const nextPressed = new Set(world.pressed);
							if (pressed) nextPressed.add(key);
							else nextPressed.delete(key);
							const playerCharacter = world.characters.get(playerEntity);
							if (playerCharacter === undefined) return world;
							const characters = new Map(world.characters);
							characters.set(playerEntity, {
								...playerCharacter,
								facing: playerFacingForDirections({
									directions: nextPressed,
									previous: playerCharacter.facing,
								}),
							});
							return {
								...world,
								pressed: nextPressed,
								characters,
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
							return {
								...movementSystem.update({ world, elapsed }),
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
						EditorAuthoredRoomLoaded: (editorAction) =>
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
