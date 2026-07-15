import { describe, expect, test } from "bun:test";
import { Controls } from "../../model/control";
import {
	Body,
	Decoration,
	type DecorationKind,
	DecorationKinds,
	Position,
} from "../components";
import { EntityId } from "../entity-id";
import { initialWorld } from "../initial-world";
import { reconcileWorld } from "../reconcile-world";
import { playerBody, playerEntity } from "../world";

describe("reconcileWorld", () => {
	test("preserves authored content while repairing transient runtime state", () => {
		const authoredEntity = EntityId(900);
		const authoredPosition = Position.make({ x: 720, y: 420 });
		const authoredBody = Body.make({ width: 80, depth: 60 });
		const floorPlan = Body.make({ width: 1_400, depth: 720 });
		const floorOrigin = Position.make({ x: -80, y: -40 });
		const positions = new Map(initialWorld.positions);
		positions.delete(playerEntity);
		positions.set(authoredEntity, authoredPosition);
		const bodies = new Map(initialWorld.bodies);
		bodies.set(playerEntity, Body.make({ width: 1, depth: 1 }));
		bodies.set(authoredEntity, authoredBody);
		const elevations = new Map(initialWorld.elevations);
		elevations.delete(playerEntity);
		const decorations = new Map(initialWorld.decorations);
		decorations.set(
			authoredEntity,
			Decoration.make({ kind: DecorationKinds.Plant, height: 84 }),
		);

		const reconciled = reconcileWorld({
			...initialWorld,
			positions,
			bodies,
			elevations,
			decorations,
			floorPlan,
			floorOrigin,
			editor: {
				...initialWorld.editor,
				open: true,
				selected: authoredEntity,
			},
			pressed: new Set([Controls.Up]),
			grabbed: authoredEntity,
			pushing: authoredEntity,
			lastFrame: 123,
		});

		expect(reconciled.floorPlan).toEqual(floorPlan);
		expect(reconciled.floorOrigin).toEqual(floorOrigin);
		expect(reconciled.positions.get(authoredEntity)).toEqual(authoredPosition);
		expect(reconciled.bodies.get(authoredEntity)).toEqual(authoredBody);
		expect(reconciled.decorations.get(authoredEntity)).toEqual({
			kind: DecorationKinds.Plant,
			height: 84,
		});
		expect(reconciled.positions.get(playerEntity)).toBeDefined();
		expect(reconciled.bodies.get(playerEntity)).toEqual(playerBody);
		expect(reconciled.elevations.get(playerEntity)).toBeDefined();
		expect(reconciled.editor.open).toBe(false);
		expect(reconciled.editor.selected).toBeNull();
		expect(reconciled.pressed.size).toBe(0);
		expect(reconciled.grabbed).toBeNull();
		expect(reconciled.pushing).toBeNull();
		expect(reconciled.lastFrame).toBe(0);
	});

	test("repairs an unknown legacy decoration height to zero", () => {
		const legacyEntity = EntityId(901);
		const reconciled = reconcileWorld({
			...initialWorld,
			decorations: new Map([
				[
					legacyEntity,
					{
						kind: "legacy-decoration" as DecorationKind,
						height: Number.NaN,
					},
				],
			]),
		});

		expect(reconciled.decorations.get(legacyEntity)?.height).toBe(0);
	});
});
