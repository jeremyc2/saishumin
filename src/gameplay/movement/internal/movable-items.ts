import { dual } from "effect/Function";
import type { Pipeable } from "../../../pipeable";
import { ObstacleKinds } from "../../../world/components";
import { placementElevationForEntity } from "../../../world/spatial/elevation";
import {
	gravity,
	groundElevation,
	obstacleHeightTolerance,
	stationaryVelocity,
	type World,
} from "../../../world/world";

/** Advances crates independently after horizontal player interactions. */
export const updateFallingMovableItems: Pipeable<
	World,
	[elapsed: number],
	World
> = dual(2, (world: World, elapsed: number): World => {
	const elevations = new Map(world.elevations);
	let changed = false;
	for (const [entity, obstacle] of world.obstacles) {
		if (obstacle.kind !== ObstacleKinds.Crate) continue;
		const position = world.positions.get(entity);
		const body = world.bodies.get(entity);
		if (position === undefined || body === undefined) continue;
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
		if (
			current.velocity === stationaryVelocity &&
			Math.abs(current.z - support) <= obstacleHeightTolerance
		)
			continue;

		const velocity = current.velocity - gravity * elapsed;
		const z = current.z + velocity * elapsed;
		const next =
			velocity <= stationaryVelocity && z <= support
				? { z: support, velocity: stationaryVelocity }
				: { z, velocity };
		elevations.set(entity, next);
		changed = true;
	}
	return changed ? { ...world, elevations } : world;
});
