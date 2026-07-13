import { describe, expect, test } from "bun:test";
import { crateBody, crateHeight } from "../ecs/world";
import { Position } from "../model/component";
import { footprint, insetRectangle, project } from "./projection";

const outlineWidth = 3;

const crateOutline = (position: Position) => {
	const top = footprint(position, crateBody, crateHeight);
	const frontBottom = project(
		{ x: position.x, y: position.y + crateBody.depth / 2 },
		0,
	);
	return insetRectangle(
		[
			top[0],
			top[1],
			{ x: top[2].x, y: frontBottom.y },
			{ x: top[3].x, y: frontBottom.y },
		],
		outlineWidth / 2,
	);
};

describe("insetRectangle", () => {
	test("keeps adjacent crate outline paths on their own sides of a shared edge", () => {
		const leftCrate = crateOutline(Position.make({ x: 400, y: 300 }));
		const rightCrate = crateOutline(
			Position.make({ x: 400 + crateBody.width, y: 300 }),
		);
		const sharedEdge = project({
			x: 400 + crateBody.width / 2,
			y: 300,
		}).x;

		expect(leftCrate[1].x).toBe(sharedEdge - outlineWidth / 2);
		expect(rightCrate[0].x).toBe(sharedEdge + outlineWidth / 2);
	});
});
