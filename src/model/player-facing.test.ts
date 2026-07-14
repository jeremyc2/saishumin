import { describe, expect, test } from "bun:test";
import { Controls, type Direction } from "./control";
import {
	type PlayerFacing,
	PlayerFacings,
	playerFacingForDirections,
} from "./player-facing";

describe("playerFacingForDirections", () => {
	const cases: ReadonlyArray<
		readonly [ReadonlyArray<Direction>, PlayerFacing]
	> = [
		[[Controls.Up], PlayerFacings.Up],
		[[Controls.Up, Controls.Right], PlayerFacings.UpRight],
		[[Controls.Right], PlayerFacings.Right],
		[[Controls.Down, Controls.Right], PlayerFacings.DownRight],
		[[Controls.Down], PlayerFacings.Down],
		[[Controls.Down, Controls.Left], PlayerFacings.DownLeft],
		[[Controls.Left], PlayerFacings.Left],
		[[Controls.Up, Controls.Left], PlayerFacings.UpLeft],
	];

	for (const [directions, expected] of cases) {
		test(`faces ${expected}`, () => {
			expect(
				playerFacingForDirections(new Set(directions), PlayerFacings.Down),
			).toBe(expected);
		});
	}

	test("keeps the previous facing while stationary", () => {
		expect(playerFacingForDirections(new Set(), PlayerFacings.UpLeft)).toBe(
			PlayerFacings.UpLeft,
		);
	});

	test("uses the remaining axis when opposite inputs cancel", () => {
		expect(
			playerFacingForDirections(
				new Set([Controls.Up, Controls.Down, Controls.Right]),
				PlayerFacings.Down,
			),
		).toBe(PlayerFacings.Right);
	});
});
