import { DecorationKinds, defaultSignContent } from "../model/component";
import { defaultEditorItemHeight, isEditorItemKind } from "../model/editor";
import { floorTileVersion } from "../model/floor-tile";
import { isPlayerFacing, PlayerFacings } from "../model/player-facing";
import { surfaceAt } from "./collision";
import {
	groundElevation,
	initialWorld,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	playerSpawnPosition,
	stationaryVelocity,
	type World,
} from "./world";

/**
 * HMR state can outlive the module definitions that created it. Reconciliation
 * repairs required player state and transient inputs while preserving geometry
 * authored in the design studio.
 */
export const reconcileWorld = (world: World): World => {
	const floorPlan = world.floorPlan ?? initialWorld.floorPlan;
	const positions = new Map(world.positions ?? initialWorld.positions);
	const bodies = new Map(world.bodies ?? initialWorld.bodies);
	const elevations = new Map(world.elevations ?? initialWorld.elevations);
	const obstacles = new Map(world.obstacles ?? initialWorld.obstacles);
	const decorations = new Map(world.decorations ?? initialWorld.decorations);
	const openedChests = new Set(world.openedChests ?? initialWorld.openedChests);
	const signContents = new Map(world.signContents ?? initialWorld.signContents);
	for (const entity of openedChests) {
		if (obstacles.get(entity)?.kind !== "chest") openedChests.delete(entity);
	}
	for (const [entity, decoration] of decorations) {
		if (decoration.kind === DecorationKinds.Sign && !signContents.has(entity))
			signContents.set(entity, defaultSignContent);
		if (Number.isFinite(decoration.height)) continue;
		decorations.set(entity, {
			...decoration,
			height: isEditorItemKind(decoration.kind)
				? defaultEditorItemHeight(decoration.kind)
				: 0,
		});
	}
	for (const entity of signContents.keys()) {
		if (decorations.get(entity)?.kind !== DecorationKinds.Sign)
			signContents.delete(entity);
	}
	const editor = world.editor ?? initialWorld.editor;
	const floorTiles =
		world.floorTiles?.every(({ version }) => version === floorTileVersion) ===
		true
			? world.floorTiles
			: initialWorld.floorTiles;
	bodies.set(playerEntity, playerBody);

	if (!positions.has(playerEntity)) {
		positions.set(playerEntity, {
			x: Math.min(
				Math.max(playerSpawnPosition.x, world.floorOrigin?.x ?? 0),
				(world.floorOrigin?.x ?? 0) + floorPlan.width,
			),
			y: Math.min(
				Math.max(playerSpawnPosition.y, world.floorOrigin?.y ?? 0),
				(world.floorOrigin?.y ?? 0) + floorPlan.depth,
			),
		});
	}
	if (!elevations.has(playerEntity)) {
		elevations.set(playerEntity, {
			z: groundElevation,
			velocity: stationaryVelocity,
		});
	}

	let reconciled: World = {
		...world,
		positions,
		bodies,
		elevations,
		obstacles,
		decorations,
		floorPlan,
		floorOrigin: world.floorOrigin ?? initialWorld.floorOrigin,
		floorTiles,
		floorTileOrigin: world.floorTileOrigin ?? initialWorld.floorTileOrigin,
		gameCamera: world.gameCamera ?? initialWorld.gameCamera,
		editor: {
			...editor,
			open: false,
			selected: null,
			invalidPlacement: null,
			editSession: null,
		},
		pressed: new Set(),
		playerFacing: isPlayerFacing(world.playerFacing)
			? world.playerFacing
			: PlayerFacings.Down,
		openedChests,
		signContents,
		readingSign: null,
		grabbed: null,
		pushing: null,
		lastFrame: 0,
	};
	const playerPosition = reconciled.positions.get(playerEntity);
	const playerElevation = reconciled.elevations.get(playerEntity);
	if (playerPosition === undefined || playerElevation === undefined) {
		return initialWorld;
	}

	const supportHeight = surfaceAt(
		reconciled,
		playerPosition,
		playerBody,
		playerElevation.z,
	);
	if (!Number.isFinite(supportHeight)) {
		const resetPositions = new Map(reconciled.positions);
		resetPositions.set(playerEntity, {
			x: Math.min(playerSpawnPosition.x, floorPlan.width),
			y: Math.min(playerSpawnPosition.y, floorPlan.depth),
		});
		const resetElevations = new Map(reconciled.elevations);
		resetElevations.set(playerEntity, {
			z: groundElevation,
			velocity: stationaryVelocity,
		});
		return {
			...reconciled,
			positions: resetPositions,
			elevations: resetElevations,
		};
	}

	if (
		playerElevation.z < supportHeight - obstacleHeightTolerance ||
		(playerElevation.velocity === stationaryVelocity &&
			playerElevation.z !== supportHeight)
	) {
		const nextElevations = new Map(reconciled.elevations);
		nextElevations.set(playerEntity, {
			z: supportHeight,
			velocity: stationaryVelocity,
		});
		reconciled = { ...reconciled, elevations: nextElevations };
	}

	return reconciled;
};
