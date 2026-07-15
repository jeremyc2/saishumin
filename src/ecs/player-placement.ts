import type { Position } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { isSolidEntity, overlaps } from "./collision";
import { entityTopElevation } from "./elevation";
import {
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	type World,
} from "./world";

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

export const isPlayerPlacementValid = (
	world: World,
	position: Position,
	elevation: number,
): boolean => {
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
			entity === playerEntity ||
			!blocksPlayerAtElevation(world, entity, elevation)
		)
			continue;
		const otherBody = world.bodies.get(entity);
		if (
			otherBody !== undefined &&
			overlaps(position, playerBody, otherPosition, otherBody)
		)
			return false;
	}
	return true;
};

export const nearestValidPlayerPosition = (
	world: World,
	origin: Position,
	elevation: number,
): Position | undefined => {
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
			entity === playerEntity ||
			!blocksPlayerAtElevation(world, entity, elevation)
		)
			continue;
		const body = world.bodies.get(entity);
		if (body === undefined) continue;
		const horizontalContact = (body.width + playerBody.width) / 2;
		const verticalContact = (body.depth + playerBody.depth) / 2;
		xCoordinates.add(clamp(position.x - horizontalContact, minimumX, maximumX));
		xCoordinates.add(clamp(position.x + horizontalContact, minimumX, maximumX));
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
};
