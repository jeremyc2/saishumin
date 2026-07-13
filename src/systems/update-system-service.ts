import { Context, Effect, Layer } from "effect";
import { surfaceAt } from "../ecs/collision";
import {
	crateEntities,
	crateGrabDistance,
	groundElevation,
	jumpSpeed,
	maximumFrameElapsedSeconds,
	millisecondsPerSecond,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../ecs/world";
import { Action } from "../model/action";
import { Controls, isDirection } from "../model/control";
import type { EntityId } from "../model/entity-id";
import { MovementSystemService } from "./movement-system-service";

export class UpdateSystemService extends Context.Service<
	UpdateSystemService,
	{
		readonly update: (world: World, action: Action) => World;
	}
>()("saishumin/systems/update-system-service/UpdateSystemService") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			const movementSystem = yield* MovementSystemService;
			const nearestGrabbableCrate = (world: World): EntityId | null => {
				const playerPosition = world.positions.get(playerEntity);
				const elevation = world.elevations.get(playerEntity);
				if (
					playerPosition === undefined ||
					elevation === undefined ||
					elevation.z !== groundElevation ||
					elevation.velocity !== stationaryVelocity
				)
					return null;

				let nearest: EntityId | null = null;
				let nearestDistance = Number.POSITIVE_INFINITY;
				for (const entity of crateEntities) {
					const cratePosition = world.positions.get(entity);
					if (cratePosition === undefined) continue;
					const distance = Math.hypot(
						cratePosition.x - playerPosition.x,
						cratePosition.y - playerPosition.y,
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
							if (key === Controls.Grab) {
								return {
									...world,
									grabbed: pressed ? nearestGrabbableCrate(world) : null,
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
								const surface = surfaceAt(world, position, playerBody);
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
								};
							}
							if (!isDirection(key)) return world;
							const nextPressed = new Set(world.pressed);
							if (pressed) nextPressed.add(key);
							else nextPressed.delete(key);
							return { ...world, pressed: nextPressed };
						},
						Tick: ({ time }) => {
							if (world.lastFrame === 0) return { ...world, lastFrame: time };
							const elapsed = Math.min(
								(time - world.lastFrame) / millisecondsPerSecond,
								maximumFrameElapsedSeconds,
							);
							return {
								...movementSystem.update(world, elapsed),
								lastFrame: time,
							};
						},
					}),
			};
		}),
	);
}
