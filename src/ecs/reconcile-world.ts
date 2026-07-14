import { defaultEditorItemHeight, isEditorItemKind } from "../model/editor";
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
 * authored in the world editor.
 */
export const reconcileWorld = (world: World): World => {
	const floorPlan = world.floorPlan ?? initialWorld.floorPlan;
	const positions = new Map(world.positions ?? initialWorld.positions);
	const bodies = new Map(world.bodies ?? initialWorld.bodies);
	const elevations = new Map(world.elevations ?? initialWorld.elevations);
	const obstacles = new Map(world.obstacles ?? initialWorld.obstacles);
	const decorations = new Map(world.decorations ?? initialWorld.decorations);
	for (const [entity, decoration] of decorations) {
		if (Number.isFinite(decoration.height)) continue;
		decorations.set(entity, {
			...decoration,
			height: isEditorItemKind(decoration.kind)
				? defaultEditorItemHeight(decoration.kind)
				: 0,
		});
	}
	const editor = world.editor ?? initialWorld.editor;
	bodies.set(playerEntity, playerBody);

	if (!positions.has(playerEntity)) {
		positions.set(playerEntity, {
			x: Math.min(playerSpawnPosition.x, floorPlan.width),
			y: Math.min(playerSpawnPosition.y, floorPlan.depth),
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
		gameCamera: world.gameCamera ?? initialWorld.gameCamera,
		editor: {
			...editor,
			open: false,
			selected: null,
			invalidPlacement: null,
		},
		pressed: new Set(),
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
