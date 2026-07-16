import type { Data } from "effect";
import { dual } from "effect/Function";
import { Action } from "../../app/action";
import type { Direction } from "../../app/control";
import {
	cameraFollowingPlayer,
	cameraForFloor,
} from "../../presentation/geometry/projection";
import {
	Body,
	DecorationKinds,
	ObstacleKinds,
	type Position,
} from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import { floorTilesCoveringPlan } from "../../world/floor";
import { surfaceAt } from "../../world/spatial/collision";
import {
	entityBaseElevation,
	placementElevationForEntity,
} from "../../world/spatial/elevation";
import {
	isPlayerPlacementValid,
	nearestValidPlayerPosition,
} from "../../world/spatial/player-placement";
import { isSupportSurfaceOccupied } from "../../world/spatial/support-surface";
import {
	groundElevation,
	isPlayerEntity,
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	obstacleHeightTolerance,
	playerEntityIn,
	stationaryVelocity,
	type World,
} from "../../world/world";
import {
	addEditorItemToWorld,
	beginEditSession,
	cancelEditSession,
	commitEditSession,
	editorItemKindForEntity,
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	isNewEditorItemPlacementValid,
	maximumEditorBody,
	previewEditSession,
} from "../edit-session/edit-session";
import {
	defaultEditorItemBody,
	EditorItemKinds,
	editorItemHeightLimits,
} from "../model";

type DesignStudioAction = Exclude<
	Action,
	Data.TaggedEnum.Value<Action, "KeyChanged" | "Tick" | "SignDismissed">
>;

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(Math.max(value, minimum), maximum);

const sanitizedEntityBody = (
	world: World,
	entity: EntityId,
	body: Body,
): Body => {
	const maximumBody = maximumEditorBody({ world, entity });
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

const invalidEntityPlacement = (
	world: World,
	entity: EntityId,
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

const addEditorItem = (
	world: World,
	kind: Parameters<typeof Action.EditorItemAdded>[0]["kind"],
	position: Position,
): World => {
	const body = defaultEditorItemBody(kind);
	if (!isNewEditorItemPlacementValid(world, kind, position, body))
		return {
			...world,
			editor: { ...world.editor, invalidPlacement: { kind: "new" } },
		};
	const candidate = addEditorItemToWorld(world, kind, position);
	const entity = candidate.editor.selected;
	if (entity === null || entity === "floor") return world;
	const candidateBody = candidate.bodies.get(entity);
	if (
		candidateBody === undefined ||
		!isEntityPlacementValid(candidate, entity, position, candidateBody)
	)
		return {
			...world,
			editor: { ...world.editor, invalidPlacement: { kind: "new" } },
		};

	const changedCharacterSpawns = new Set(world.editor.changedCharacterSpawns);
	if (candidate.characters.has(entity)) changedCharacterSpawns.add(entity);
	return {
		...candidate,
		editor: {
			...world.editor,
			selected: entity,
			changedCharacterSpawns,
		},
	};
};

const toggleDesignStudio = (world: World): World => {
	const withoutSession = cancelEditSession(world);
	const open = !withoutSession.editor.open;
	let toggled: World = {
		...withoutSession,
		pressed: new Set<Direction>(),
		lavaMonsterSteering: new Map(),
		readingSign: null,
		grabbed: null,
		pushing: null,
		lastFrame: 0,
		editor: {
			...withoutSession.editor,
			open,
			camera: open ? withoutSession.gameCamera : withoutSession.editor.camera,
			selected: null,
			invalidPlacement: null,
			editSession: null,
			changedCharacterSpawns: open
				? new Set()
				: withoutSession.editor.changedCharacterSpawns,
		},
	};
	if (open) return toggled;
	const positions = new Map(toggled.positions);
	const elevations = new Map(toggled.elevations);
	for (const entity of withoutSession.editor.changedCharacterSpawns) {
		const spawn = withoutSession.characterSpawns.get(entity);
		const body = withoutSession.bodies.get(entity);
		if (spawn === undefined || body === undefined) continue;
		positions.set(entity, spawn);
		elevations.set(entity, {
			z: surfaceAt(withoutSession, spawn, body),
			velocity: stationaryVelocity,
		});
	}
	toggled = {
		...toggled,
		positions,
		elevations,
		editor: { ...toggled.editor, changedCharacterSpawns: new Set() },
	};
	const playerEntity = playerEntityIn(toggled);
	if (playerEntity === undefined) return toggled;
	const playerPosition = toggled.positions.get(playerEntity);
	const playerElevation = toggled.elevations.get(playerEntity);
	if (
		playerPosition === undefined ||
		playerElevation === undefined ||
		isPlayerPlacementValid(toggled, playerPosition, playerElevation.z)
	)
		return toggled;
	const safePosition = nearestValidPlayerPosition(
		toggled,
		playerPosition,
		groundElevation,
	);
	if (safePosition === undefined) return toggled;
	const safePositions = new Map(toggled.positions);
	safePositions.set(playerEntity, safePosition);
	const safeElevations = new Map(toggled.elevations);
	safeElevations.set(playerEntity, {
		z: groundElevation,
		velocity: stationaryVelocity,
	});
	toggled = {
		...toggled,
		positions: safePositions,
		elevations: safeElevations,
	};
	return {
		...toggled,
		gameCamera: cameraFollowingPlayer({
			world: toggled,
			camera: toggled.gameCamera,
		}),
	};
};

const resizeEntity = (
	world: World,
	entity: EntityId,
	body: Body,
	position: Position | undefined,
): World => {
	if (
		!world.editor.open ||
		isPlayerEntity(world, entity) ||
		!world.bodies.has(entity)
	)
		return world;
	const currentPosition = world.positions.get(entity);
	const currentBody = world.bodies.get(entity);
	if (currentPosition === undefined || currentBody === undefined) return world;
	const nextBody = sanitizedEntityBody(world, entity, body);
	const nextPosition = position ?? currentPosition;
	if (
		!isEntityPlacementValid(world, entity, nextPosition, nextBody, {
			position: currentPosition,
			body: currentBody,
		})
	)
		return invalidEntityPlacement(world, entity, currentPosition, currentBody);
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
	if (position === undefined) return { ...world, bodies, elevations };
	const positions = new Map(world.positions);
	positions.set(entity, position);
	return { ...world, bodies, positions, elevations };
};

const changeEntityHeight = (
	world: World,
	entity: EntityId,
	height: number,
): World => {
	if (!world.editor.open || !Number.isFinite(height)) return world;
	const kind = editorItemKindForEntity({ world, entity });
	if (kind === undefined || kind === EditorItemKinds.Hopscotch) return world;
	const limits = editorItemHeightLimits(kind);
	const nextHeight = clamp(height, limits.minimum, limits.maximum);
	const obstacle = world.obstacles.get(entity);
	if (obstacle === undefined) {
		const decoration = world.decorations.get(entity);
		if (decoration === undefined) return world;
		const decorations = new Map(world.decorations);
		decorations.set(entity, { ...decoration, height: nextHeight });
		return { ...world, decorations };
	}
	const obstacles = new Map(world.obstacles);
	obstacles.set(entity, { ...obstacle, height: nextHeight });
	let updated: World = { ...world, obstacles };
	if (obstacle.kind === ObstacleKinds.Wall) return updated;
	const oldTop = entityBaseElevation(world, entity) + obstacle.height;
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
		elevations.set(otherEntity, {
			z: isPlayerEntity(world, otherEntity)
				? surfaceAt(updated, position, body)
				: placementElevationForEntity(updated, otherEntity, position, body),
			velocity: stationaryVelocity,
		});
	}
	updated = { ...updated, elevations };
	return updated;
};

const dismissInvalidPlacement = (world: World): World => {
	if (world.editor.editSession !== null) return cancelEditSession(world);
	const invalidPlacement = world.editor.invalidPlacement;
	if (invalidPlacement === null) return world;
	if (invalidPlacement.kind === "new")
		return { ...world, editor: { ...world.editor, invalidPlacement: null } };
	if (invalidPlacement.kind === "floor") {
		const resized = {
			...world,
			floorPlan: invalidPlacement.floorPlan,
			floorOrigin: invalidPlacement.floorOrigin,
			editor: { ...world.editor, invalidPlacement: null },
		};
		return {
			...resized,
			gameCamera: cameraFollowingPlayer({
				world: resized,
				camera: cameraForFloor(
					invalidPlacement.floorPlan,
					invalidPlacement.floorOrigin,
				),
			}),
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
};

const deleteSelected = (world: World): World => {
	const selected = world.editor.selected;
	if (!world.editor.open || selected === null || selected === "floor")
		return world;
	const position = world.positions.get(selected);
	const body = world.bodies.get(selected);
	if (position === undefined || body === undefined) return world;
	if (isSupportSurfaceOccupied(world, selected, position, body))
		return invalidEntityPlacement(world, selected, position, body);
	const positions = new Map(world.positions);
	const bodies = new Map(world.bodies);
	const obstacles = new Map(world.obstacles);
	const decorations = new Map(world.decorations);
	const elevations = new Map(world.elevations);
	const openedChests = new Set(world.openedChests);
	const signContents = new Map(world.signContents);
	const characters = new Map(world.characters);
	const characterSpawns = new Map(world.characterSpawns);
	const lavaMonsterSteering = new Map(world.lavaMonsterSteering);
	positions.delete(selected);
	bodies.delete(selected);
	obstacles.delete(selected);
	decorations.delete(selected);
	elevations.delete(selected);
	openedChests.delete(selected);
	signContents.delete(selected);
	characters.delete(selected);
	characterSpawns.delete(selected);
	lavaMonsterSteering.delete(selected);
	return {
		...world,
		positions,
		bodies,
		obstacles,
		decorations,
		elevations,
		openedChests,
		signContents,
		characters,
		characterSpawns,
		lavaMonsterSteering,
		editor: { ...world.editor, selected: null },
	};
};

const dispatchDesignStudioAction = (world: World, action: Action): World =>
	Action.$match(action, {
		KeyChanged: () => world,
		Tick: () => world,
		EditorToggled: () => toggleDesignStudio(world),
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
				isPlayerEntity(world, entity) ||
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
			)
				return invalidEntityPlacement(
					world,
					entity,
					currentPosition,
					currentBody,
				);
			const positions = new Map(world.positions);
			const elevations = new Map(world.elevations);
			positions.set(entity, position);
			elevations.set(entity, {
				z: placementElevationForEntity(world, entity, position, currentBody),
				velocity: stationaryVelocity,
			});
			return { ...world, positions, elevations };
		},
		EditorEntityResized: ({ entity, body, position }) =>
			resizeEntity(world, entity, body, position),
		EditorEntityHeightChanged: ({ entity, height }) =>
			changeEntityHeight(world, entity, height),
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
				return invalidFloorPlacement(world, world.floorPlan, world.floorOrigin);
			return {
				...resized,
				gameCamera: cameraFollowingPlayer({
					world: resized,
					camera: cameraForFloor(nextFloorPlan, world.floorOrigin),
				}),
			};
		},
		EditorCameraChanged: ({ camera }) =>
			world.editor.open
				? { ...world, editor: { ...world.editor, camera } }
				: world,
		EditorInvalidPlacementDismissed: () => dismissInvalidPlacement(world),
		EditorAuthoredRoomLoaded: ({ world: loaded }) =>
			world.editor.open
				? {
						...loaded,
						editor: {
							...loaded.editor,
							open: true,
							camera: loaded.gameCamera,
						},
					}
				: world,
		SignDismissed: () => world,
		EditorDeleteSelected: () => deleteSelected(world),
	});

export const updateDesignStudioAction = dual<
	(action: DesignStudioAction) => (self: World) => World,
	(self: World, action: DesignStudioAction) => World
>(
	2,
	(world: World, action: DesignStudioAction): World =>
		dispatchDesignStudioAction(world, action),
);
