import { Context, Effect, Layer } from "effect";
import { surfaceAt } from "../ecs/collision";
import {
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
} from "../ecs/editor-placement";
import {
	editorItemKindForEntity,
	maximumEditorBody,
} from "../ecs/editor-sizing";
import {
	entityBaseElevation,
	placementElevationForEntity,
	placementElevationForKind,
} from "../ecs/elevation";
import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../ecs/player-placement";
import { advancePlayerTrail } from "../ecs/player-trail";
import { isSupportSurfaceOccupied } from "../ecs/support-surface";
import {
	crateGrabDistance,
	crateHeight,
	groundElevation,
	jumpSpeed,
	maximumFloorExtent,
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
	wallHeight,
} from "../ecs/world";
import { Action } from "../model/action";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	type Position,
} from "../model/component";
import { Controls, type Direction, isDirection } from "../model/control";
import {
	defaultEditorItemBody,
	defaultEditorItemHeight,
	EditorItemKinds,
	editorItemHeightLimits,
} from "../model/editor";
import { EntityId, type EntityId as EntityIdType } from "../model/entity-id";
import { playerFacingForDirections } from "../model/player-facing";
import {
	cameraForFloor,
	followCamera,
	projectVector,
} from "../render/projection";
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
		width: clamp(
			Number.isFinite(body.width) ? body.width : minimumFloorWidth,
			minimumFloorWidth,
			maximumFloorExtent,
		),
		depth: clamp(
			Number.isFinite(body.depth) ? body.depth : minimumFloorDepth,
			minimumFloorDepth,
			maximumFloorExtent,
		),
	});

const nextEntityId = (world: World): EntityIdType => {
	let greatestId = 0;
	for (const entity of world.positions.keys()) {
		greatestId = Math.max(greatestId, entity);
	}
	return EntityId(greatestId + 1);
};

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
	const entity = nextEntityId(world);
	const positions = new Map(world.positions);
	const bodies = new Map(world.bodies);
	const obstacles = new Map(world.obstacles);
	const decorations = new Map(world.decorations);
	const elevations = new Map(world.elevations);
	positions.set(entity, position);
	bodies.set(entity, defaultEditorItemBody(kind));

	if (kind === EditorItemKinds.Wall) {
		obstacles.set(
			entity,
			Obstacle.make({ height: wallHeight, kind: ObstacleKinds.Wall }),
		);
	} else if (kind === EditorItemKinds.Platform) {
		obstacles.set(
			entity,
			Obstacle.make({ height: 40, kind: ObstacleKinds.Platform }),
		);
	} else if (kind === EditorItemKinds.Crate) {
		obstacles.set(
			entity,
			Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
		);
	} else if (kind === EditorItemKinds.Rug) {
		decorations.set(
			entity,
			Decoration.make({
				kind: DecorationKinds.Rug,
				height: defaultEditorItemHeight(kind),
			}),
		);
	} else if (kind === EditorItemKinds.Plant) {
		decorations.set(
			entity,
			Decoration.make({
				kind: DecorationKinds.Plant,
				height: defaultEditorItemHeight(kind),
			}),
		);
	} else {
		decorations.set(
			entity,
			Decoration.make({
				kind: DecorationKinds.Lamp,
				height: defaultEditorItemHeight(kind),
			}),
		);
	}
	elevations.set(
		entity,
		Elevation.make({
			z: placementElevationForKind(
				world,
				kind,
				position,
				bodies.get(entity) ?? defaultEditorItemBody(kind),
			),
			velocity: stationaryVelocity,
		}),
	);
	const candidate = {
		...world,
		positions,
		bodies,
		obstacles,
		decorations,
		elevations,
	};
	const body = bodies.get(entity);
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

const translateFloorOrigin = (world: World, delta: Position): World => {
	if (delta.x === 0 && delta.y === 0) return world;
	const positions = new Map(world.positions);
	for (const [entity, position] of positions) {
		positions.set(entity, {
			x: position.x - delta.x,
			y: position.y - delta.y,
		});
	}
	const cameraDelta = projectVector(delta);
	return {
		...world,
		positions,
		editor: {
			...world.editor,
			camera: {
				x: world.editor.camera.x + cameraDelta.x,
				y: world.editor.camera.y + cameraDelta.y,
			},
		},
	};
};

const invalidFloorPlacement = (
	world: World,
	floorPlan: Body,
	originOffset: Position,
): World => ({
	...world,
	editor: {
		...world.editor,
		invalidPlacement: { kind: "floor", floorPlan, originOffset },
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
							if (world.editor.open) return world;
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
							if (world.editor.open) return { ...world, lastFrame: time };
							if (world.lastFrame === 0) return { ...world, lastFrame: time };
							const elapsed = Math.min(
								(time - world.lastFrame) / millisecondsPerSecond,
								maximumFrameElapsedSeconds,
							);
							const moved = movementSystem.update(world, elapsed);
							const withTrail = advancePlayerTrail(world, moved, elapsed);
							return {
								...withTrail,
								gameCamera: cameraFollowingPlayer(withTrail, world.gameCamera),
								lastFrame: time,
							};
						},
						EditorToggled: () => {
							const open = !world.editor.open;
							let toggled: World = {
								...world,
								pressed: new Set<Direction>(),
								playerTrail: [],
								grabbed: null,
								pushing: null,
								lastFrame: 0,
								editor: {
									...world.editor,
									open,
									camera: open ? world.gameCamera : world.editor.camera,
									selected: null,
									invalidPlacement: null,
								},
							};
							if (open) return toggled;
							const playerPosition = world.positions.get(playerEntity);
							const playerElevation = world.elevations.get(playerEntity);
							if (
								playerPosition === undefined ||
								playerElevation === undefined ||
								isPlayerPlacementValid(world, playerPosition, playerElevation.z)
							)
								return toggled;
							const safePosition = nearestValidPlayerPosition(
								world,
								playerPosition,
								groundElevation,
							);
							if (safePosition === undefined) return toggled;
							const positions = new Map(world.positions);
							positions.set(playerEntity, safePosition);
							const elevations = new Map(world.elevations);
							elevations.set(playerEntity, {
								z: groundElevation,
								velocity: stationaryVelocity,
							});
							toggled = { ...toggled, positions, elevations };
							return {
								...toggled,
								gameCamera: cameraFollowingPlayer(toggled, world.gameCamera),
							};
						},
						EditorSelectionChanged: ({ selection }) =>
							world.editor.open
								? { ...world, editor: { ...world.editor, selected: selection } }
								: world,
						EditorItemAdded: ({ kind, position }) =>
							world.editor.open ? addEditorItem(world, kind, position) : world,
						EditorEntityMoved: ({
							entity,
							position,
							originalPosition,
							originalBody,
							preview,
						}) => {
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
								preview !== true &&
								!isEntityPlacementValid(world, entity, position, currentBody, {
									position: originalPosition ?? currentPosition,
									body: originalBody ?? currentBody,
								})
							) {
								return invalidEntityPlacement(
									world,
									entity,
									originalPosition ?? currentPosition,
									originalBody ?? currentBody,
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
						EditorEntityResized: ({
							entity,
							body,
							position,
							originalPosition,
							originalBody,
							preview,
						}) => {
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
								preview !== true &&
								!isEntityPlacementValid(world, entity, nextPosition, nextBody, {
									position: originalPosition ?? currentPosition,
									body: originalBody ?? currentBody,
								})
							) {
								return invalidEntityPlacement(
									world,
									entity,
									originalPosition ?? currentPosition,
									originalBody ?? currentBody,
								);
							}
							const bodies = new Map(world.bodies);
							const elevations = new Map(world.elevations);
							bodies.set(entity, nextBody);
							const interactionPosition = originalPosition ?? currentPosition;
							const interactionBody = originalBody ?? currentBody;
							const originalElevation = placementElevationForEntity(
								world,
								entity,
								interactionPosition,
								interactionBody,
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
						EditorEntityInteractionFinished: ({
							entity,
							originalPosition,
							originalBody,
						}) => {
							if (!world.editor.open || entity === playerEntity) return world;
							const position = world.positions.get(entity);
							const body = world.bodies.get(entity);
							if (position === undefined || body === undefined) return world;
							return isEntityPlacementValid(world, entity, position, body, {
								position: originalPosition,
								body: originalBody,
							})
								? world
								: invalidEntityPlacement(
										world,
										entity,
										originalPosition,
										originalBody,
									);
						},
						EditorEntityHeightChanged: ({ entity, height }) => {
							if (!world.editor.open || !Number.isFinite(height)) return world;
							const kind = editorItemKindForEntity(world, entity);
							if (kind === undefined || kind === EditorItemKinds.Rug)
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
						EditorFloorResized: ({ floorPlan, originDelta, preview }) => {
							if (!world.editor.open) return world;
							const nextFloorPlan = sanitizedFloorPlan(floorPlan);
							const offset = originDelta ?? { x: 0, y: 0 };
							const resized = translateFloorOrigin(
								{ ...world, floorPlan: nextFloorPlan },
								offset,
							);
							if (preview === true) return resized;
							if (!isFloorPlanPlacementValid(resized, nextFloorPlan))
								return invalidFloorPlacement(resized, world.floorPlan, offset);
							return {
								...resized,
								gameCamera: cameraFollowingPlayer(
									resized,
									cameraForFloor(nextFloorPlan),
								),
							};
						},
						EditorFloorInteractionFinished: ({
							originalFloorPlan,
							originOffset,
						}) => {
							if (!world.editor.open) return world;
							if (!isFloorPlanPlacementValid(world, world.floorPlan))
								return invalidFloorPlacement(
									world,
									originalFloorPlan,
									originOffset,
								);
							return {
								...world,
								gameCamera: cameraFollowingPlayer(
									world,
									cameraForFloor(world.floorPlan),
								),
							};
						},
						EditorCameraChanged: ({ camera }) =>
							world.editor.open
								? { ...world, editor: { ...world.editor, camera } }
								: world,
						EditorInvalidPlacementDismissed: () => {
							const invalidPlacement = world.editor.invalidPlacement;
							if (invalidPlacement === null) return world;
							if (invalidPlacement.kind === "new") {
								return {
									...world,
									editor: { ...world.editor, invalidPlacement: null },
								};
							}
							if (invalidPlacement.kind === "floor") {
								const restoredOrigin = translateFloorOrigin(world, {
									x: -invalidPlacement.originOffset.x,
									y: -invalidPlacement.originOffset.y,
								});
								const resized = {
									...restoredOrigin,
									floorPlan: invalidPlacement.floorPlan,
									editor: {
										...restoredOrigin.editor,
										invalidPlacement: null,
									},
								};
								return {
									...resized,
									gameCamera: cameraFollowingPlayer(
										resized,
										cameraForFloor(invalidPlacement.floorPlan),
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
							positions.delete(selected);
							bodies.delete(selected);
							obstacles.delete(selected);
							decorations.delete(selected);
							elevations.delete(selected);
							return {
								...world,
								positions,
								bodies,
								obstacles,
								decorations,
								elevations,
								editor: { ...world.editor, selected: null },
							};
						},
					}),
			};
		}),
	);
}
