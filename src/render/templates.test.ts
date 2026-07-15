import { describe, expect, test } from "bun:test";
import { Body, PlayerFacings, Position } from "../world/components";
import {
	closedChestTemplate,
	crateShadowDepthOffset,
	crateTopBoardDepthOffsets,
	lavaMonsterDrawingForFacing,
	openChestTemplate,
	playerDrawingForFacing,
	signpostTemplate,
} from "./templates";

describe("crate shadows", () => {
	test("only offsets shadow sections below the supporting surface", () => {
		expect(crateShadowDepthOffset(62, 62)).toBe(0);
		expect(crateShadowDepthOffset(62, 0)).toBeGreaterThan(0);
	});
});

describe("crate top boards", () => {
	test("splits a deep crate top into three equal boards", () => {
		const [firstDivider, secondDivider] = crateTopBoardDepthOffsets(240);
		const insetDepth = 240 - 18;
		const boardDepths = [
			firstDivider + insetDepth / 2,
			secondDivider - firstDivider,
			insetDepth / 2 - secondDivider,
		];

		expect(boardDepths).toEqual([
			insetDepth / 3,
			insetDepth / 3,
			insetDepth / 3,
		]);
	});
});

describe("chest templates", () => {
	test("use distinct open and closed artwork", () => {
		const position = Position.make({ x: 300, y: 300 });
		const body = Body.make({ width: 84, depth: 64 });
		const closed = closedChestTemplate(position, body, 52);
		const open = openChestTemplate(position, body, 52);

		expect(closed.strings.join("")).toContain('data-chest-state="closed"');
		expect(open.strings.join("")).toContain('data-chest-state="open"');
	});
});

describe("signpost template", () => {
	test("renders a wooden signpost", () => {
		const template = signpostTemplate(
			Position.make({ x: 300, y: 300 }),
			Body.make({ width: 88, depth: 56 }),
			104,
		);

		expect(template.strings.join("")).toContain('data-decoration-kind="sign"');
	});
});

describe("player drawings", () => {
	test("uses five authored views for eight facings", () => {
		const drawings = [
			PlayerFacings.Up,
			PlayerFacings.UpRight,
			PlayerFacings.Right,
			PlayerFacings.DownRight,
			PlayerFacings.Down,
			PlayerFacings.DownLeft,
			PlayerFacings.Left,
			PlayerFacings.UpLeft,
		].map(playerDrawingForFacing);

		expect(new Set(drawings.map(({ view }) => view)).size).toBe(5);
		expect(drawings[1]?.view).toBe(drawings[7]?.view);
		expect(drawings[1]?.mirror).toBe(false);
		expect(drawings[7]?.mirror).toBe(true);
		expect(drawings[2]?.view).toBe(drawings[6]?.view);
		expect(drawings[2]?.mirror).toBe(false);
		expect(drawings[6]?.mirror).toBe(true);
		expect(drawings[3]?.view).toBe(drawings[5]?.view);
		expect(drawings[3]?.mirror).toBe(false);
		expect(drawings[5]?.mirror).toBe(true);
	});
});

describe("lava monster drawings", () => {
	test("uses five authored views for eight facings", () => {
		const drawings = [
			PlayerFacings.Up,
			PlayerFacings.UpRight,
			PlayerFacings.Right,
			PlayerFacings.DownRight,
			PlayerFacings.Down,
			PlayerFacings.DownLeft,
			PlayerFacings.Left,
			PlayerFacings.UpLeft,
		].map(lavaMonsterDrawingForFacing);

		expect(new Set(drawings.map(({ view }) => view)).size).toBe(5);
		expect(new Set(drawings.map(({ expression }) => expression)).size).toBe(5);
		expect(drawings[1]?.view).toBe(drawings[7]?.view);
		expect(drawings[1]?.mirror).toBe(false);
		expect(drawings[7]?.mirror).toBe(true);
		expect(drawings[2]?.view).toBe(drawings[6]?.view);
		expect(drawings[2]?.mirror).toBe(false);
		expect(drawings[6]?.mirror).toBe(true);
		expect(drawings[3]?.view).toBe(drawings[5]?.view);
		expect(drawings[3]?.mirror).toBe(false);
		expect(drawings[5]?.mirror).toBe(true);
	});
});
