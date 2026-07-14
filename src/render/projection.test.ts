import { describe, expect, test } from "bun:test";
import { crateBody, crateHeight } from "../ecs/world";
import { Body, Position } from "../model/component";
import {
	cameraForFloor,
	followCamera,
	insetRectangle,
	project,
	projectedRectangle,
	unproject,
	viewport,
} from "./projection";

const outlineWidth = 3;

const crateOutline = (position: Position) => {
	const top = projectedRectangle(position, crateBody, crateHeight);
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

describe("camera projection", () => {
	test("centers the floor in the viewport", () => {
		const floorPlan = Body.make({ width: 1160, depth: 640 });
		const floorCenter = Position.make({
			x: floorPlan.width / 2,
			y: floorPlan.depth / 2,
		});
		const projected = project(floorCenter);
		const camera = cameraForFloor(floorPlan);

		expect(projected.x + camera.x).toBe(viewport.width / 2);
		expect(projected.y + camera.y).toBe(viewport.height / 2);
	});

	test("only follows outside the dead zone and stops when walking away", () => {
		const centered = Position.make({ x: 0, y: 0 });
		const nearRightEdge = Position.make({ x: 1200, y: 320 });
		const following = followCamera(centered, nearRightEdge);

		expect(following.x).toBe(-140);
		expect(followCamera(following, { x: 1100, y: 320 })).toEqual(following);
		expect(followCamera(following, { x: 1350, y: 320 }).x).toBe(-290);
	});

	test("unprojects canvas coordinates without changing scale", () => {
		const position = Position.make({ x: 415, y: 275 });
		const result = unproject(project(position));

		expect(result.x).toBeCloseTo(position.x);
		expect(result.y).toBeCloseTo(position.y);
	});
});
