import { describe, expect, test } from "bun:test";
import { Body, PlayerFacings, Position } from "../../../world/components";
import {
	closedChestTemplate,
	crateTemplate,
	lavaMonsterTemplate,
	openChestTemplate,
	playerTemplate,
	signpostTemplate,
} from "../entities";

describe("crate shadows", () => {
	test("renders a crate with its supporting shadow", () => {
		const template = crateTemplate(
			Position.make({ x: 300, y: 300 }),
			Body.make({ width: 84, depth: 64 }),
			62,
			false,
			62,
			[
				{
					position: Position.make({ x: 300, y: 300 }),
					body: Body.make({ width: 84, depth: 64 }),
					elevation: 0,
				},
			],
		);

		expect(
			template.values.flat().some(
				(value) =>
					typeof value === "object" &&
					value !== null &&
					"strings" in value &&
					Array.isArray(value.strings) &&
					value.strings.join("").includes('fill="#14212a"'),
			),
		).toBe(true);
	});
});

describe("crate top boards", () => {
	test("renders divider lines across a deep crate top", () => {
		const template = crateTemplate(
			Position.make({ x: 300, y: 300 }),
			Body.make({ width: 84, depth: 240 }),
			62,
			false,
		);

		expect(template.strings.join("")).toContain("<line");
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
		].map((facing) =>
			playerTemplate(
				Position.make({ x: 300, y: 300 }),
				{ z: 0, velocity: 0 },
				0,
				facing,
			),
		);

		const views = drawings.map((template) => template.values[3]);
		expect(new Set(views).size).toBe(5);
		expect(views[1]).toBe(views[7]);
		expect(views[2]).toBe(views[6]);
		expect(views[3]).toBe(views[5]);
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
		].map((facing) =>
			lavaMonsterTemplate(
				Position.make({ x: 300, y: 300 }),
				{ z: 0, velocity: 0 },
				0,
				facing,
			),
		);

		const views = drawings.map((template) => template.values[3]);
		const expressions = drawings.map((template) => template.values[4]);
		expect(new Set(views).size).toBe(5);
		expect(new Set(expressions).size).toBe(5);
		expect(views[1]).toBe(views[7]);
		expect(views[2]).toBe(views[6]);
		expect(views[3]).toBe(views[5]);
	});
});
