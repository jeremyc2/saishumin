import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
	authoredRoomFromWorld,
	copyAuthoredRoomToClipboard,
	loadAuthoredRoomFromClipboard,
	stringifyAuthoredRoom,
} from "../authored-room";
import { Position } from "../components";
import { EntityId } from "../entity-id";
import { initialWorld } from "../initial-world";

describe("Authored Room serialization", () => {
	test("serializes Character Spawn positions instead of transient live positions", () => {
		const player = EntityId(1);
		const livePosition = Position.make({ x: 500, y: 500 });
		const room = authoredRoomFromWorld({
			...initialWorld,
			positions: new Map(initialWorld.positions).set(player, livePosition),
		});

		expect(
			room.entities.find(({ entity }) => entity === player)?.position,
		).toEqual(initialWorld.characterSpawns.get(player));
	});
	test("serializes authored data in deterministic Entity ID order", () => {
		const serialized = stringifyAuthoredRoom({
			...initialWorld,
			positions: new Map([...initialWorld.positions].reverse()),
			editor: { ...initialWorld.editor, open: true, selected: "floor" },
			pressed: new Set(["ArrowLeft"]),
			openedChests: new Set([EntityId(7)]),
			readingSign: EntityId(14),
			grabbed: EntityId(8),
			pushing: EntityId(8),
			lastFrame: 1234,
		});
		const parsed = JSON.parse(serialized) as {
			readonly entities: ReadonlyArray<{ readonly entity: number }>;
			readonly editor?: unknown;
			readonly pressed?: unknown;
			readonly openedChests?: unknown;
			readonly lastFrame?: unknown;
		};

		expect(parsed.entities.map(({ entity }) => entity)).toEqual([
			...initialWorld.positions.keys(),
		]);
		expect(parsed.editor).toBeUndefined();
		expect(parsed.pressed).toBeUndefined();
		expect(parsed.openedChests).toBeUndefined();
		expect(parsed.lastFrame).toBeUndefined();
		expect(serialized).toContain('\n  "floorPlan"');
	});

	test("writes the serialized Authored Room through the clipboard boundary", () => {
		let clipboardText = "";
		const program = copyAuthoredRoomToClipboard({
			world: initialWorld,
			writeText: (text) => {
				clipboardText = text;
				return Promise.resolve();
			},
		}).pipe(
			Effect.andThen(
				Effect.sync(() => {
					expect(clipboardText).toBe(stringifyAuthoredRoom(initialWorld));
				}),
			),
		);

		return Effect.runPromise(program);
	});

	test("reads, validates, and rebuilds an Authored Room from clipboard JSON", () => {
		const serialized = stringifyAuthoredRoom(initialWorld);
		const program = loadAuthoredRoomFromClipboard({
			readText: () => Promise.resolve(serialized),
		}).pipe(
			Effect.andThen((world) =>
				Effect.sync(() => {
					expect(stringifyAuthoredRoom(world)).toBe(serialized);
				}),
			),
		);

		return Effect.runPromise(program);
	});

	test("rejects clipboard JSON that does not satisfy the Authored Room schema", () => {
		const result = loadAuthoredRoomFromClipboard({
			readText: () => Promise.resolve('{"floorPlan":null}'),
		}).pipe(
			Effect.match({ onFailure: () => true, onSuccess: () => false }),
			Effect.runPromise,
		);

		return result.then((rejected) => expect(rejected).toBe(true));
	});
});
