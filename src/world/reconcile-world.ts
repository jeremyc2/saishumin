import {
	CharacterKinds,
	DecorationKinds,
	defaultDecorationHeight,
	defaultSignContent,
	isDecorationKind,
	isPlayerFacing,
	PlayerFacings,
} from "./components";
import { floorTileVersion } from "./floor";
import { initialWorld } from "./initial-world";
import { surfaceAt } from "./spatial/collision";
import {
	characterSpawnPosition,
	groundElevation,
	obstacleHeightTolerance,
	playerBody,
	playerEntityIn,
	playerSpawnPosition,
	stationaryVelocity,
	type World,
} from "./world";

/**
 * World state may not satisfy the current game invariants, regardless of where
 * it came from. Reconciliation repairs required entity and transient state while
 * preserving valid content authored in the design studio.
 */
export const reconcileWorld = (world: World): World => {
	const floorPlan = world.floorPlan ?? initialWorld.floorPlan;
	const positions = new Map(world.positions ?? initialWorld.positions);
	const bodies = new Map(world.bodies ?? initialWorld.bodies);
	const elevations = new Map(world.elevations ?? initialWorld.elevations);
	const obstacles = new Map(world.obstacles ?? initialWorld.obstacles);
	const decorations = new Map(world.decorations ?? initialWorld.decorations);
	const characters = new Map(world.characters ?? initialWorld.characters);
	const characterSpawns = new Map(
		world.characterSpawns ?? initialWorld.characterSpawns,
	);
	let foundPlayer = false;
	for (const [entity, character] of characters) {
		if (!positions.has(entity) || !bodies.has(entity)) {
			characters.delete(entity);
			characterSpawns.delete(entity);
			continue;
		}
		if (character.kind === CharacterKinds.Player) {
			if (foundPlayer) {
				characters.delete(entity);
				continue;
			}
			foundPlayer = true;
		}
		if (isPlayerFacing(character.facing)) continue;
		characters.set(entity, {
			...character,
			facing:
				character.kind === CharacterKinds.Player
					? PlayerFacings.Down
					: PlayerFacings.Left,
		});
	}
	for (const entity of characterSpawns.keys()) {
		if (!characters.has(entity)) characterSpawns.delete(entity);
	}
	for (const entity of characters.keys()) {
		const position = positions.get(entity);
		if (!characterSpawns.has(entity) && position !== undefined)
			characterSpawns.set(entity, position);
	}
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
			height: isDecorationKind(decoration.kind)
				? defaultDecorationHeight(decoration.kind)
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
	let reconciled: World = {
		...world,
		positions,
		bodies,
		elevations,
		obstacles,
		decorations,
		characters,
		characterSpawns,
		lavaMonsterSteering: new Map(),
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
			changedCharacterSpawns: new Set(),
		},
		pressed: new Set(),
		openedChests,
		signContents,
		readingSign: null,
		grabbed: null,
		pushing: null,
		lastFrame: 0,
	};
	const playerEntity = playerEntityIn(reconciled);
	if (playerEntity === undefined) return reconciled;
	const playerPosition = reconciled.positions.get(playerEntity);
	const playerElevation = reconciled.elevations.get(playerEntity);
	if (playerPosition === undefined || playerElevation === undefined) {
		return reconciled;
	}

	const supportHeight = surfaceAt(
		reconciled,
		playerPosition,
		playerBody,
		playerElevation.z,
	);
	if (!Number.isFinite(supportHeight)) {
		const spawnPosition =
			characterSpawnPosition({ world: reconciled, entity: playerEntity }) ??
			playerSpawnPosition;
		const resetPositions = new Map(reconciled.positions);
		resetPositions.set(playerEntity, {
			x: Math.min(spawnPosition.x, floorPlan.width),
			y: Math.min(spawnPosition.y, floorPlan.depth),
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
