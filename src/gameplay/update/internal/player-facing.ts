import { Controls, type Direction } from "../../../app/control";
import { type PlayerFacing, PlayerFacings } from "../../../world/components";

/**
 * Resolves the same signed input vector used by movement into one of the eight
 * compass facings. When the vector cancels out, the player keeps looking in the
 * last meaningful direction instead of snapping to a default pose.
 */
export const playerFacingForDirections = ({
	directions,
	previous,
}: {
	readonly directions: ReadonlySet<Direction>;
	readonly previous: PlayerFacing;
}): PlayerFacing => {
	const horizontal =
		Number(directions.has(Controls.Right)) -
		Number(directions.has(Controls.Left));
	const vertical =
		Number(directions.has(Controls.Down)) - Number(directions.has(Controls.Up));

	if (vertical < 0) {
		if (horizontal < 0) return PlayerFacings.UpLeft;
		if (horizontal > 0) return PlayerFacings.UpRight;
		return PlayerFacings.Up;
	}
	if (vertical > 0) {
		if (horizontal < 0) return PlayerFacings.DownLeft;
		if (horizontal > 0) return PlayerFacings.DownRight;
		return PlayerFacings.Down;
	}
	if (horizontal < 0) return PlayerFacings.Left;
	if (horizontal > 0) return PlayerFacings.Right;
	return previous;
};
