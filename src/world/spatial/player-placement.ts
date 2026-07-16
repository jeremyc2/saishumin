import { dual } from "effect/Function";
import type { Position } from "../components";
import type { EntityId } from "../entity-id";
import {
	isPlayerEntity,
	obstacleHeightTolerance,
	playerBody,
	type World,
} from "../world";
import { isSolidEntity, overlaps } from "./collision";
import { entityTopElevation } from "./elevation";

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(Math.max(value, minimum), maximum);

const blocksPlayerAtElevation = (
	world: World,
	entity: EntityId,
	elevation: number,
): boolean => {
	if (!isSolidEntity(world, entity)) return false;
	return (
		elevation < entityTopElevation(world, entity) - obstacleHeightTolerance
	);
};

export const isPlayerPlacementValid = dual<
	(position: Position, elevation: number) => (self: World) => boolean,
	(self: World, position: Position, elevation: number) => boolean
>(3, (world: World, position: Position, elevation: number): boolean => {
	if (
		position.x - playerBody.width / 2 < world.floorOrigin.x ||
		position.x + playerBody.width / 2 >
			world.floorOrigin.x + world.floorPlan.width ||
		position.y - playerBody.depth / 2 < world.floorOrigin.y ||
		position.y + playerBody.depth / 2 >
			world.floorOrigin.y + world.floorPlan.depth
	)
		return false;

	for (const [entity, otherPosition] of world.positions) {
		if (
			isPlayerEntity(world, entity) ||
			!blocksPlayerAtElevation(world, entity, elevation)
		)
			continue;
		const otherBody = world.bodies.get(entity);
		if (
			otherBody !== undefined &&
			overlaps({ position, body: playerBody, otherPosition, otherBody })
		)
			return false;
	}
	return true;
});

export const nearestValidPlayerPosition = dual<
	(
		origin: Position,
		elevation: number,
	) => (self: World) => Position | undefined,
	(self: World, origin: Position, elevation: number) => Position | undefined
>(
	3,
	(world: World, origin: Position, elevation: number): Position | undefined => {
		const minimumX = world.floorOrigin.x + playerBody.width / 2;
		const maximumX =
			world.floorOrigin.x + world.floorPlan.width - playerBody.width / 2;
		const minimumY = world.floorOrigin.y + playerBody.depth / 2;
		const maximumY =
			world.floorOrigin.y + world.floorPlan.depth - playerBody.depth / 2;
		if (minimumX > maximumX || minimumY > maximumY) return undefined;

		const xCoordinates = new Set([
			clamp(origin.x, minimumX, maximumX),
			minimumX,
			maximumX,
		]);
		const yCoordinates = new Set([
			clamp(origin.y, minimumY, maximumY),
			minimumY,
			maximumY,
		]);
		for (const [entity, position] of world.positions) {
			if (
				isPlayerEntity(world, entity) ||
				!blocksPlayerAtElevation(world, entity, elevation)
			)
				continue;
			const body = world.bodies.get(entity);
			if (body === undefined) continue;
			const horizontalContact = (body.width + playerBody.width) / 2;
			const verticalContact = (body.depth + playerBody.depth) / 2;
			xCoordinates.add(
				clamp(position.x - horizontalContact, minimumX, maximumX),
			);
			xCoordinates.add(
				clamp(position.x + horizontalContact, minimumX, maximumX),
			);
			yCoordinates.add(clamp(position.y - verticalContact, minimumY, maximumY));
			yCoordinates.add(clamp(position.y + verticalContact, minimumY, maximumY));
		}

		let nearest: Position | undefined;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const x of xCoordinates) {
			for (const y of yCoordinates) {
				const candidate = { x, y };
				if (!isPlayerPlacementValid(world, candidate, elevation)) continue;
				const distance = Math.hypot(x - origin.x, y - origin.y);
				if (distance < nearestDistance) {
					nearest = candidate;
					nearestDistance = distance;
				}
			}
		}
		return nearest;
	},
);
