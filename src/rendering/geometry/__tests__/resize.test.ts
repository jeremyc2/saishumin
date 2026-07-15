import { describe, expect, test } from "bun:test";
import { Body, Position } from "../../../world/components";
import { resizeFromHandle } from "../resize";

const position = Position.make({ x: 50, y: 40 });
const body = Body.make({ width: 100, depth: 80 });
const minimumBody = Body.make({ width: 24, depth: 24 });
const maximumBody = Body.make({ width: 140, depth: 120 });

describe("resizeFromHandle", () => {
	test("moves only the dragged edge and keeps its opposite fixed", () => {
		const resized = resizeFromHandle(
			position,
			body,
			{ x: 30, y: 0 },
			1,
			0,
			minimumBody,
			maximumBody,
		);

		expect(resized).toEqual({
			position: { x: 65, y: 40 },
			body: { width: 130, depth: 80 },
		});
		expect(resized.position.x - resized.body.width / 2).toBe(0);
	});

	test("resizes a single axis from an edge handle", () => {
		const resized = resizeFromHandle(
			position,
			body,
			{ x: 0, y: 30 },
			0,
			-1,
			minimumBody,
			maximumBody,
		);

		expect(resized).toEqual({
			position: { x: 50, y: 55 },
			body: { width: 100, depth: 50 },
		});
		expect(resized.position.y + resized.body.depth / 2).toBe(80);
	});

	test("anchors both opposite edges when resizing from a corner", () => {
		const resized = resizeFromHandle(
			position,
			body,
			{ x: 20, y: 10 },
			1,
			1,
			minimumBody,
			maximumBody,
		);

		expect(resized).toEqual({
			position: { x: 60, y: 45 },
			body: { width: 120, depth: 90 },
		});
	});

	test("keeps the fixed edge stable at the minimum size", () => {
		const resized = resizeFromHandle(
			position,
			body,
			{ x: 200, y: 0 },
			-1,
			0,
			minimumBody,
			maximumBody,
		);

		expect(resized.body.width).toBe(minimumBody.width);
		expect(resized.position.x + resized.body.width / 2).toBe(100);
	});

	test("keeps the fixed edge stable at the maximum size", () => {
		const resized = resizeFromHandle(
			position,
			body,
			{ x: 200, y: 0 },
			1,
			0,
			minimumBody,
			maximumBody,
		);

		expect(resized.body.width).toBe(maximumBody.width);
		expect(resized.position.x - resized.body.width / 2).toBe(0);
	});
});
