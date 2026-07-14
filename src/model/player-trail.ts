import type { Position } from "./component";
import type { EntityId } from "./entity-id";
import type { PlayerFacing } from "./player-facing";

export type PlayerTrailMark = {
	readonly position: Position;
	readonly elevation: number;
	readonly supportEntity: EntityId | null;
	readonly facing: PlayerFacing;
	readonly age: number;
};

export const playerTrailLifetimeSeconds = 3.2;
export const playerTrailMarkSpacing = 12;

export const playerTireTrackFade = (age: number): number => {
	const progress = Math.min(1, Math.max(0, age / playerTrailLifetimeSeconds));
	const smoothProgress = progress * progress * (3 - 2 * progress);
	return 1 - smoothProgress;
};
