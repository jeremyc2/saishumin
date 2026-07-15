import { unproject } from "../../rendering/geometry/projection";
import type { Body, Position } from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import {
	bodyBoundsOverlap,
	canSitOnPlatform,
	canSitOnSupport,
	entityTopElevation,
} from "../../world/spatial/elevation";
import { groundElevation, type World } from "../../world/world";
import type { EditorItemKind } from "../model";

const subtract = (position: Position, offset: Position): Position => ({
	x: position.x - offset.x,
	y: position.y - offset.y,
});

/**
 * Resolves an editor pointer against the visible plane beneath it. A screen
 * point on a raised platform has a different world-depth coordinate than the
 * same screen point on the floor, so each eligible platform must be
 * inverse-projected at its own top elevation.
 */
export const editorPlacementPositionAtPointer = ({
	world,
	kind,
	body,
	projectedPointer,
	grabOffset = { x: 0, y: 0 },
	excludedEntity,
}: {
	readonly world: World;
	readonly kind: EditorItemKind;
	readonly body: Body;
	readonly projectedPointer: Position;
	readonly grabOffset?: Position;
	readonly excludedEntity?: EntityId;
}): Position => {
	let resolvedPosition = subtract(
		unproject(projectedPointer, groundElevation),
		grabOffset,
	);
	if (!canSitOnPlatform(kind)) return resolvedPosition;

	let resolvedElevation = groundElevation;
	for (const [entity, obstacle] of world.obstacles) {
		if (
			entity === excludedEntity ||
			!canSitOnSupport({ kind, supportKind: obstacle.kind })
		)
			continue;
		const platformPosition = world.positions.get(entity);
		const platformBody = world.bodies.get(entity);
		if (platformPosition === undefined || platformBody === undefined) continue;

		const elevation = entityTopElevation(world, entity);
		const candidate = subtract(
			unproject(projectedPointer, elevation),
			grabOffset,
		);
		if (
			elevation >= resolvedElevation &&
			bodyBoundsOverlap({
				position: platformPosition,
				body: platformBody,
				otherPosition: candidate,
				otherBody: body,
			})
		) {
			resolvedElevation = elevation;
			resolvedPosition = candidate;
		}
	}
	return resolvedPosition;
};
