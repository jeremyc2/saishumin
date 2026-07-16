import { describe, expect, test } from "bun:test";
import { Controls } from "../../app/control";
import {
	Body,
	CharacterKinds,
	Decoration,
	type DecorationKind,
	DecorationKinds,
	PlayerFacings,
	Position,
} from "../components";
import { EntityId } from "../entity-id";
import { initialWorld } from "../initial-world";
import { reconcileWorld } from "../reconcile-world";

const playerEntity = EntityId(1);
const lavaMonsterEntity = EntityId(2);

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
		bodies.delete(playerEntity);
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
		expect(reconciled.positions.has(playerEntity)).toBe(false);
		expect(reconciled.bodies.has(playerEntity)).toBe(false);
		expect(reconciled.elevations.has(playerEntity)).toBe(false);
		expect(reconciled.editor.open).toBe(false);
		expect(reconciled.editor.selected).toBeNull();
		expect(reconciled.pressed.size).toBe(0);
		expect(reconciled.grabbed).toBeNull();
		expect(reconciled.pushing).toBeNull();
		expect(reconciled.lastFrame).toBe(0);
	});

	test("does not invent optional gameplay characters", () => {
		const positions = new Map(initialWorld.positions);
		positions.delete(playerEntity);
		positions.delete(lavaMonsterEntity);
		const bodies = new Map(initialWorld.bodies);
		bodies.delete(playerEntity);
		bodies.delete(lavaMonsterEntity);
		const elevations = new Map(initialWorld.elevations);
		elevations.delete(playerEntity);
		elevations.delete(lavaMonsterEntity);

		const reconciled = reconcileWorld({
			...initialWorld,
			positions,
			bodies,
			elevations,
		});

		expect(reconciled.positions.has(playerEntity)).toBe(false);
		expect(reconciled.positions.has(lavaMonsterEntity)).toBe(false);
		expect(reconciled.bodies.has(playerEntity)).toBe(false);
		expect(reconciled.bodies.has(lavaMonsterEntity)).toBe(false);
	});

	test("repairs a missing facing on an existing character", () => {
		const monster = EntityId(902);
		const reconciled = reconcileWorld({
			...initialWorld,
			positions: new Map(initialWorld.positions).set(
				monster,
				Position.make({ x: 800, y: 300 }),
			),
			bodies: new Map(initialWorld.bodies).set(
				monster,
				Body.make({ width: 68, depth: 48 }),
			),
			characters: new Map(initialWorld.characters).set(monster, {
				kind: CharacterKinds.LavaMonster,
				facing: undefined as never,
			}),
		});

		expect(reconciled.characters.get(monster)?.facing).toBe(PlayerFacings.Left);
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
