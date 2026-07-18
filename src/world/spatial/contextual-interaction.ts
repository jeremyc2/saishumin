import { DecorationKinds, ObstacleKinds, PlayerFacings } from "../components";
import type { EntityId } from "../entity-id";
import {
	interactionDistance,
	obstacleHeightTolerance,
	playerBody,
	playerEntityIn,
	stationaryVelocity,
	type World,
} from "../world";
import { entityBaseElevation } from "./elevation";

export type ContextualInteractionTarget = {
	readonly entity: EntityId;
	readonly kind: "chest" | "sign";
};

const interactableInFrontOfPlayer = (
	world: World,
	isInteractable: (entity: EntityId) => boolean,
): EntityId | null => {
	const playerEntity = playerEntityIn(world);
	if (playerEntity === undefined) return null;
	const playerPosition = world.positions.get(playerEntity);
	const playerElevation = world.elevations.get(playerEntity);
	const playerCharacter = world.characters.get(playerEntity);
	if (
		playerPosition === undefined ||
		playerElevation === undefined ||
		playerElevation.velocity !== stationaryVelocity ||
		playerCharacter?.facing !== PlayerFacings.Up
	)
		return null;
	for (const [entity, objectPosition] of world.positions) {
		if (!isInteractable(entity)) continue;
		const objectBody = world.bodies.get(entity);
		if (
			objectBody === undefined ||
			Math.abs(entityBaseElevation(world, entity) - playerElevation.z) >
				obstacleHeightTolerance
		)
			continue;
		const horizontalOverlap =
			Math.abs(playerPosition.x - objectPosition.x) <
			(playerBody.width + objectBody.width) / 2;
		const frontGap =
			playerPosition.y -
			playerBody.depth / 2 -
			(objectPosition.y + objectBody.depth / 2);
		if (horizontalOverlap && frontGap >= 0 && frontGap <= interactionDistance)
			return entity;
	}
	return null;
};

export const contextualInteractionTarget = (
	world: World,
): ContextualInteractionTarget | null => {
	if (world.editor.open || world.readingSign !== null) return null;
	const chest = interactableInFrontOfPlayer(
		world,
		(entity) => world.obstacles.get(entity)?.kind === ObstacleKinds.Chest,
	);
	if (chest !== null) return { entity: chest, kind: "chest" };
	const sign = interactableInFrontOfPlayer(
		world,
		(entity) => world.decorations.get(entity)?.kind === DecorationKinds.Sign,
	);
	return sign === null ? null : { entity: sign, kind: "sign" };
};
