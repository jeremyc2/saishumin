import { Context, Effect, Layer } from "effect";
import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../ecs/player-placement";
import { Action } from "../model/action";
import { Controls, type Direction, isDirection } from "../model/control";
import {
	addEditorItemToWorld,
	beginEditSession,
	cancelEditSession,
	commitEditSession,
	editorItemKindForEntity,
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	maximumEditorBody,
	previewEditSession,
} from "../design-studio/edit-session/edit-session";
import {
	EditorItemKinds,
	editorItemHeightLimits,
} from "../design-studio/model";
import { playerFacingForDirections } from "../model/player-facing";
import { cameraForFloor, followCamera } from "../render/projection";
import {
	Body,
	DecorationKinds,
	ObstacleKinds,
	PlayerFacings,
	type Position,
} from "../world/components";
import type { EntityId as EntityIdType } from "../world/entity-id";
import { floorTilesCoveringPlan } from "../world/floor";
import { surfaceAt } from "../world/spatial/collision";
import {
	entityBaseElevation,
	placementElevationForEntity,
} from "../world/spatial/elevation";
import { isSupportSurfaceOccupied } from "../world/spatial/support-surface";
import {
	crateGrabDistance,
	groundElevation,
	interactionDistance,
	jumpSpeed,
	maximumFrameElapsedSeconds,
	millisecondsPerSecond,
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../world/world";
import { MovementSystemService } from "./movement-system-service";

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(Math.max(value, minimum), maximum);

const sanitizedEntityBody = (
	world: World,
	entity: EntityIdType,
	body: Body,
): Body => {
	const maximumBody = maximumEditorBody(world, entity);
	return Body.make({
		width: clamp(
			Number.isFinite(body.width) ? body.width : minimumEntityExtent,
			minimumEntityExtent,
			maximumBody.width,
		),
		depth: clamp(
			Number.isFinite(body.depth) ? body.depth : minimumEntityExtent,
			minimumEntityExtent,
			maximumBody.depth,
		),
	});
};

const sanitizedFloorPlan = (body: Body): Body =>
	Body.make({
		width: Math.max(
			minimumFloorWidth,
			Number.isFinite(body.width) ? body.width : minimumFloorWidth,
		),
		depth: Math.max(
			minimumFloorDepth,
			Number.isFinite(body.depth) ? body.depth : minimumFloorDepth,
		),
	});

const cameraFollowingPlayer = (world: World, camera: Position): Position => {
	const position = world.positions.get(playerEntity);
	const elevation = world.elevations.get(playerEntity);
	return position === undefined
		? camera
		: followCamera(camera, position, elevation?.z ?? groundElevation);
};

const addEditorItem = (
	world: World,
	kind: Parameters<typeof Action.EditorItemAdded>[0]["kind"],
	position: Position,
): World => {
	const candidate = addEditorItemToWorld(world, kind, position);
	const entity = candidate.editor.selected;
	if (entity === null || entity === "floor") return world;
	const body = candidate.bodies.get(entity);
	if (
		body === undefined ||
		!isEntityPlacementValid(candidate, entity, position, body)
	) {
		return {
			...world,
			editor: {
				...world.editor,
				invalidPlacement: { kind: "new" },
			},
		};
	}

	return {
		...candidate,
		editor: { ...world.editor, selected: entity },
	};
};

const invalidEntityPlacement = (
	world: World,
	entity: EntityIdType,
	position: Position,
	body: Body,
): World => ({
	...world,
	editor: {
		...world.editor,
		invalidPlacement: { kind: "entity", entity, position, body },
	},
});

const invalidFloorPlacement = (
	world: World,
	floorPlan: Body,
	floorOrigin: Position,
): World => ({
	...world,
	editor: {
		...world.editor,
		invalidPlacement: { kind: "floor", floorPlan, floorOrigin },
	},
});

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
							if (key === Controls.Grab) {
								return {
									...world,
									grabbed: pressed ? nearestGrabbableObject(world) : null,
									pushing: null,
								};
							}
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
								const nextElevations = new Map(world.elevations);
								nextElevations.set(playerEntity, {
									z: elevation.z,
									velocity: jumpSpeed,
								});
								return {
									...world,
									elevations: nextElevations,
									grabbed: null,
									pushing: null,
								};
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
						EditorToggled: () => {
							const withoutSession = cancelEditSession(world);
							const open = !withoutSession.editor.open;
							let toggled: World = {
								...withoutSession,
								pressed: new Set<Direction>(),
								readingSign: null,
								grabbed: null,
								pushing: null,
								lastFrame: 0,
								editor: {
									...withoutSession.editor,
									open,
									camera: open
										? withoutSession.gameCamera
										: withoutSession.editor.camera,
									selected: null,
									invalidPlacement: null,
									editSession: null,
								},
							};
							if (open) return toggled;
							const playerPosition = withoutSession.positions.get(playerEntity);
							const playerElevation =
								withoutSession.elevations.get(playerEntity);
							if (
								playerPosition === undefined ||
								playerElevation === undefined ||
								isPlayerPlacementValid(
									withoutSession,
									playerPosition,
									playerElevation.z,
								)
							)
								return toggled;
							const safePosition = nearestValidPlayerPosition(
								withoutSession,
								playerPosition,
								groundElevation,
							);
							if (safePosition === undefined) return toggled;
							const positions = new Map(withoutSession.positions);
							positions.set(playerEntity, safePosition);
							const elevations = new Map(withoutSession.elevations);
							elevations.set(playerEntity, {
								z: groundElevation,
								velocity: stationaryVelocity,
							});
							toggled = { ...toggled, positions, elevations };
							return {
								...toggled,
								gameCamera: cameraFollowingPlayer(
									toggled,
									withoutSession.gameCamera,
								),
							};
						},
						EditorSelectionChanged: ({ selection }) =>
							world.editor.open
								? { ...world, editor: { ...world.editor, selected: selection } }
								: world,
						EditorEditSessionBegan: ({ operation }) =>
							beginEditSession(world, operation),
						EditorEditSessionPreviewed: ({ preview }) =>
							previewEditSession(world, preview),
						EditorEditSessionAutoPanned: ({ camera, preview }) =>
							previewEditSession(
								{ ...world, editor: { ...world.editor, camera } },
								preview,
							),
						EditorEditSessionCommitted: () => commitEditSession(world),
						EditorEditSessionCancelled: () => cancelEditSession(world),
						EditorItemAdded: ({ kind, position }) =>
							world.editor.open ? addEditorItem(world, kind, position) : world,
						EditorEntityMoved: ({ entity, position }) => {
							if (
								!world.editor.open ||
								entity === playerEntity ||
								!world.positions.has(entity)
							)
								return world;
							const currentPosition = world.positions.get(entity);
							const currentBody = world.bodies.get(entity);
							if (currentPosition === undefined || currentBody === undefined)
								return world;
							if (
								!isEntityPlacementValid(world, entity, position, currentBody, {
									position: currentPosition,
									body: currentBody,
								})
							) {
								return invalidEntityPlacement(
									world,
									entity,
									currentPosition,
									currentBody,
								);
							}
							const positions = new Map(world.positions);
							const elevations = new Map(world.elevations);
							positions.set(entity, position);
							elevations.set(entity, {
								z: placementElevationForEntity(
									world,
									entity,
									position,
									currentBody,
								),
								velocity: stationaryVelocity,
							});
							return { ...world, positions, elevations };
						},
						EditorEntityResized: ({ entity, body, position }) => {
							if (
								!world.editor.open ||
								entity === playerEntity ||
								!world.bodies.has(entity)
							)
								return world;
							const currentPosition = world.positions.get(entity);
							const currentBody = world.bodies.get(entity);
							if (currentPosition === undefined || currentBody === undefined)
								return world;
							const nextBody = sanitizedEntityBody(world, entity, body);
							const nextPosition = position ?? currentPosition;
							if (
								!isEntityPlacementValid(world, entity, nextPosition, nextBody, {
									position: currentPosition,
									body: currentBody,
								})
							) {
								return invalidEntityPlacement(
									world,
									entity,
									currentPosition,
									currentBody,
								);
							}
							const bodies = new Map(world.bodies);
							const elevations = new Map(world.elevations);
							bodies.set(entity, nextBody);
							const originalElevation = placementElevationForEntity(
								world,
								entity,
								currentPosition,
								currentBody,
							);
							elevations.set(entity, {
								z: placementElevationForEntity(
									world,
									entity,
									nextPosition,
									nextBody,
									originalElevation,
								),
								velocity: stationaryVelocity,
							});
							if (position === undefined)
								return { ...world, bodies, elevations };
							const positions = new Map(world.positions);
							positions.set(entity, position);
							return { ...world, bodies, positions, elevations };
						},
						EditorEntityHeightChanged: ({ entity, height }) => {
							if (!world.editor.open || !Number.isFinite(height)) return world;
							const kind = editorItemKindForEntity(world, entity);
							if (kind === undefined || kind === EditorItemKinds.Hopscotch)
								return world;
							const limits = editorItemHeightLimits(kind);
							const nextHeight = clamp(height, limits.minimum, limits.maximum);
							const obstacle = world.obstacles.get(entity);
							if (obstacle !== undefined) {
								const obstacles = new Map(world.obstacles);
								obstacles.set(entity, { ...obstacle, height: nextHeight });
								let updated: World = { ...world, obstacles };
								if (obstacle.kind === ObstacleKinds.Wall) return updated;

								const oldTop =
									entityBaseElevation(world, entity) + obstacle.height;
								const elevations = new Map(updated.elevations);
								for (const [otherEntity, elevation] of updated.elevations) {
									if (
										otherEntity === entity ||
										Math.abs(elevation.z - oldTop) > obstacleHeightTolerance
									)
										continue;
									const position = updated.positions.get(otherEntity);
									const body = updated.bodies.get(otherEntity);
									if (position === undefined || body === undefined) continue;
									if (otherEntity === playerEntity) {
										elevations.set(otherEntity, {
											z: surfaceAt(updated, position, body),
											velocity: stationaryVelocity,
										});
										continue;
									}
									elevations.set(otherEntity, {
										z: placementElevationForEntity(
											updated,
											otherEntity,
											position,
											body,
										),
										velocity: stationaryVelocity,
									});
								}
								updated = { ...updated, elevations };
								return updated;
							}
							const decoration = world.decorations.get(entity);
							if (decoration === undefined) return world;
							const decorations = new Map(world.decorations);
							decorations.set(entity, { ...decoration, height: nextHeight });
							return { ...world, decorations };
						},
						EditorSignContentChanged: ({ entity, content }) => {
							if (
								!world.editor.open ||
								world.decorations.get(entity)?.kind !== DecorationKinds.Sign
							)
								return world;
							const signContents = new Map(world.signContents);
							signContents.set(entity, content);
							return { ...world, signContents };
						},
						EditorFloorResized: ({ floorPlan }) => {
							if (!world.editor.open) return world;
							const nextFloorPlan = sanitizedFloorPlan(floorPlan);
							const resized = {
								...world,
								floorPlan: nextFloorPlan,
								floorTiles: floorTilesCoveringPlan(
									world.floorTiles,
									world.floorTileOrigin,
									nextFloorPlan,
									world.floorOrigin,
								),
							};
							if (!isFloorPlanPlacementValid(resized, nextFloorPlan))
								return invalidFloorPlacement(
									world,
									world.floorPlan,
									world.floorOrigin,
								);
							return {
								...resized,
								gameCamera: cameraFollowingPlayer(
									resized,
									cameraForFloor(nextFloorPlan, world.floorOrigin),
								),
							};
						},
						EditorCameraChanged: ({ camera }) =>
							world.editor.open
								? { ...world, editor: { ...world.editor, camera } }
								: world,
						EditorInvalidPlacementDismissed: () => {
							if (world.editor.editSession !== null)
								return cancelEditSession(world);
							const invalidPlacement = world.editor.invalidPlacement;
							if (invalidPlacement === null) return world;
							if (invalidPlacement.kind === "new") {
								return {
									...world,
									editor: { ...world.editor, invalidPlacement: null },
								};
							}
							if (invalidPlacement.kind === "floor") {
								const resized = {
									...world,
									floorPlan: invalidPlacement.floorPlan,
									floorOrigin: invalidPlacement.floorOrigin,
									editor: {
										...world.editor,
										invalidPlacement: null,
									},
								};
								return {
									...resized,
									gameCamera: cameraFollowingPlayer(
										resized,
										cameraForFloor(
											invalidPlacement.floorPlan,
											invalidPlacement.floorOrigin,
										),
									),
								};
							}
							const positions = new Map(world.positions);
							const bodies = new Map(world.bodies);
							const elevations = new Map(world.elevations);
							positions.set(invalidPlacement.entity, invalidPlacement.position);
							bodies.set(invalidPlacement.entity, invalidPlacement.body);
							elevations.set(invalidPlacement.entity, {
								z: placementElevationForEntity(
									world,
									invalidPlacement.entity,
									invalidPlacement.position,
									invalidPlacement.body,
								),
								velocity: stationaryVelocity,
							});
							return {
								...world,
								positions,
								bodies,
								elevations,
								editor: { ...world.editor, invalidPlacement: null },
							};
						},
						SignDismissed: () =>
							world.readingSign === null
								? world
								: { ...world, readingSign: null },
						EditorDeleteSelected: () => {
							const selected = world.editor.selected;
							if (
								!world.editor.open ||
								selected === null ||
								selected === "floor" ||
								selected === playerEntity
							)
								return world;
							const selectedPosition = world.positions.get(selected);
							const selectedBody = world.bodies.get(selected);
							if (selectedPosition === undefined || selectedBody === undefined)
								return world;
							if (
								isSupportSurfaceOccupied(
									world,
									selected,
									selectedPosition,
									selectedBody,
								)
							)
								return invalidEntityPlacement(
									world,
									selected,
									selectedPosition,
									selectedBody,
								);
							const positions = new Map(world.positions);
							const bodies = new Map(world.bodies);
							const obstacles = new Map(world.obstacles);
							const decorations = new Map(world.decorations);
							const elevations = new Map(world.elevations);
							const openedChests = new Set(world.openedChests);
							const signContents = new Map(world.signContents);
							positions.delete(selected);
							bodies.delete(selected);
							obstacles.delete(selected);
							decorations.delete(selected);
							elevations.delete(selected);
							openedChests.delete(selected);
							signContents.delete(selected);
							return {
								...world,
								positions,
								bodies,
								obstacles,
								decorations,
								elevations,
								openedChests,
								signContents,
								editor: { ...world.editor, selected: null },
							};
						},
					}),
			};
		}),
	);
}
