import { describe, expect, test } from "bun:test";
import { pipe } from "effect/Function";
import { Body, Position } from "../../../world/components";
import { crateBody, crateHeight } from "../../../world/world";
import {
	cameraForFloor,
	canvasViewportForScreen,
	followCamera,
	insetRectangle,
	project,
	projectedRectangle,
	unproject,
	viewport,
} from "../projection";

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
	test("fills portrait and landscape screens without letterboxing the canvas", () => {
		const portrait = canvasViewportForScreen({
			screen: { width: 390, height: 844 },
			zoom: 1,
		});
		const landscape = canvasViewportForScreen({
			screen: { width: 844, height: 390 },
			zoom: 1,
		});

		expect(portrait.width / portrait.height).toBeCloseTo(390 / 844);
		expect(landscape.width / landscape.height).toBeCloseTo(844 / 390);
		expect(portrait.height).toBeGreaterThan(viewport.height);
		expect(landscape.width).toBeGreaterThan(viewport.width);
	});

	test("centers pinch zoom on the same canvas midpoint", () => {
		const zoomed = canvasViewportForScreen({
			screen: { width: 390, height: 844 },
			zoom: 2,
		});

		expect(zoomed.left + zoomed.width / 2).toBe(viewport.width / 2);
		expect(zoomed.top + zoomed.height / 2).toBe(viewport.height / 2);
	});

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

	test("centers a floor with a non-zero origin in the viewport", () => {
		const floorPlan = Body.make({ width: 1_160, depth: 640 });
		const floorOrigin = Position.make({ x: -240, y: -120 });
		const floorCenter = Position.make({
			x: floorOrigin.x + floorPlan.width / 2,
			y: floorOrigin.y + floorPlan.depth / 2,
		});
		const projected = project(floorCenter);
		const camera = cameraForFloor(floorPlan, floorOrigin);

		expect({ x: projected.x + camera.x, y: projected.y + camera.y }).toEqual({
			x: viewport.width / 2,
			y: viewport.height / 2,
		});
	});

	test("only follows outside the dead zone and stops when walking away", () => {
		const centered = Position.make({ x: 0, y: 0 });
		const nearRightEdge = Position.make({ x: 1200, y: 320 });
		const following = followCamera(centered, nearRightEdge);

		expect(following.x).toBe(-460);
		expect(followCamera(following, { x: 1100, y: 320 })).toEqual(following);
		expect(followCamera(following, { x: 1350, y: 320 }).x).toBe(-610);
	});

	test("unprojects canvas coordinates without changing scale", () => {
		const position = Position.make({ x: 415, y: 275 });
		const result = pipe(position, project(), unproject());

		expect(result.x).toBeCloseTo(position.x);
		expect(result.y).toBeCloseTo(position.y);
	});
});
