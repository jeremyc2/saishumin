import { surfaceAt } from "./collision";
import {
	crateEntities,
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
 * Restored world state, e.g. HMR or persisted save state, can outlive the static
 * definitions that created it, leaving physics and rendering with different
 * geometry. Reconciliation applies the current definitions and repairs invalid
 * transient state while preserving movable entity positions.
 */
export const reconcileWorld = (world: World): World => {
	const positions = new Map(initialWorld.positions);
	for (const entity of [playerEntity, ...crateEntities]) {
		const position = world.positions.get(entity);
		if (position !== undefined) positions.set(entity, position);
	}

	let reconciled: World = {
		...world,
		positions,
		bodies: initialWorld.bodies,
		obstacles: initialWorld.obstacles,
		pressed: new Set(),
		grabbed: null,
		lastFrame: 0,
	};
	const playerPosition = reconciled.positions.get(playerEntity);
	const playerElevation = reconciled.elevations.get(playerEntity);
	if (playerPosition === undefined || playerElevation === undefined) {
		return initialWorld;
	}

	const supportHeight = surfaceAt(reconciled, playerPosition, playerBody);
	if (!Number.isFinite(supportHeight)) {
		const resetPositions = new Map(reconciled.positions);
		resetPositions.set(playerEntity, playerSpawnPosition);
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
		const elevations = new Map(reconciled.elevations);
		elevations.set(playerEntity, {
			z: supportHeight,
			velocity: stationaryVelocity,
		});
		reconciled = { ...reconciled, elevations };
	}

	return reconciled;
};
