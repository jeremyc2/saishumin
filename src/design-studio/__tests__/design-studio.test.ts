import { describe, expect, test } from "bun:test";
import { Action } from "../../app/action";
import { Body, CharacterKinds, Position } from "../../world/components";
import { EntityId } from "../../world/entity-id";
import { initialWorld } from "../../world/initial-world";
import { updateDesignStudio } from "../design-studio";
import { CharacterSpawnKinds, EditorItemKinds } from "../model";

const crateEntities = [EntityId(8)] as const;

describe("Design Studio actions", () => {
	test("opens an Edit Session and updates its camera through the Design Studio interface", () => {
		const opened = updateDesignStudio(initialWorld, Action.EditorToggled());
		const camera = Position.make({ x: -120, y: 40 });
		const updated = updateDesignStudio(
			opened,
			Action.EditorCameraChanged({ camera }),
		);

		expect(opened.editor.open).toBe(true);
		expect(updated.editor.camera).toEqual(camera);
	});

	test("authors Editor Items and dismisses an invalid placement", () => {
		const editing = updateDesignStudio(initialWorld, Action.EditorToggled());
		const added = updateDesignStudio(
			editing,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Sign,
				position: Position.make({ x: 800, y: 500 }),
			}),
		);
		const selected = added.editor.selected;
		expect(selected).not.toBeNull();
		if (selected === null || selected === "floor") return;
		const signed = updateDesignStudio(
			added,
			Action.EditorSignContentChanged({
				entity: selected,
				content: { title: "Welcome", body: "Home" },
			}),
		);
		const invalid = updateDesignStudio(
			signed,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Plant,
				position: Position.make({ x: 10, y: 10 }),
			}),
		);

		expect(signed.signContents.get(selected)).toEqual({
			title: "Welcome",
			body: "Home",
		});
		expect(invalid.editor.invalidPlacement).toEqual({ kind: "new" });
		expect(
			updateDesignStudio(invalid, Action.EditorInvalidPlacementDismissed())
				.editor.invalidPlacement,
		).toBeNull();
	});

	test("moves, resizes, resizes the floor, and deletes through one interface", () => {
		const editing = updateDesignStudio(initialWorld, Action.EditorToggled());
		const entity = crateEntities[0];
		const moved = updateDesignStudio(
			editing,
			Action.EditorEntityMoved({
				entity,
				position: Position.make({ x: 650, y: 350 }),
			}),
		);
		const resized = updateDesignStudio(
			moved,
			Action.EditorEntityResized({
				entity,
				body: Body.make({ width: 80, depth: 80 }),
			}),
		);
		const floor = updateDesignStudio(
			resized,
			Action.EditorFloorResized({
				floorPlan: Body.make({ width: 1_240, depth: 680 }),
			}),
		);
		const deleted = updateDesignStudio(
			{ ...floor, editor: { ...floor.editor, selected: entity } },
			Action.EditorDeleteSelected(),
		);

		expect(resized.bodies.get(entity)).toEqual({ width: 80, depth: 80 });
		expect(floor.floorPlan.width).toBe(1_240);
		expect(deleted.positions.has(entity)).toBe(false);
	});

	test("loads a validated Authored Room while keeping the Design Studio open", () => {
		const editing = updateDesignStudio(initialWorld, Action.EditorToggled());
		const loadedFloorPlan = Body.make({ width: 1_400, depth: 700 });
		const loaded = updateDesignStudio(
			editing,
			Action.EditorAuthoredRoomLoaded({
				world: { ...initialWorld, floorPlan: loadedFloorPlan },
			}),
		);

		expect(loaded.floorPlan).toEqual(loadedFloorPlan);
		expect(loaded.editor.open).toBe(true);
		expect(loaded.editor.selected).toBeNull();
	});

	test("preserves live character positions when their Character Spawns are untouched", () => {
		const player = EntityId(1);
		const lavaMonster = EntityId(2);
		const livePlayerPosition = Position.make({ x: 360, y: 410 });
		const liveMonsterPosition = Position.make({ x: 820, y: 370 });
		const played = {
			...initialWorld,
			positions: new Map(initialWorld.positions)
				.set(player, livePlayerPosition)
				.set(lavaMonster, liveMonsterPosition),
		};

		const editing = updateDesignStudio(played, Action.EditorToggled());
		const resumed = updateDesignStudio(editing, Action.EditorToggled());

		expect(resumed.positions.get(player)).toEqual(livePlayerPosition);
		expect(resumed.positions.get(lavaMonster)).toEqual(liveMonsterPosition);
	});

	test("starts only a changed Character Spawn at its newly committed position", () => {
		const player = EntityId(1);
		const lavaMonster = EntityId(2);
		const livePlayerPosition = Position.make({ x: 360, y: 410 });
		const liveMonsterPosition = Position.make({ x: 820, y: 370 });
		const spawnPosition = Position.make({ x: 310, y: 460 });
		const played = {
			...initialWorld,
			positions: new Map(initialWorld.positions)
				.set(player, livePlayerPosition)
				.set(lavaMonster, liveMonsterPosition),
		};
		const editing = updateDesignStudio(played, Action.EditorToggled());
		const originalPosition = initialWorld.characterSpawns.get(player);
		const originalBody = initialWorld.bodies.get(player);
		expect(originalPosition).toBeDefined();
		expect(originalBody).toBeDefined();
		if (originalPosition === undefined || originalBody === undefined) return;
		const began = updateDesignStudio(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "move",
					entity: player,
					originalPosition,
					originalBody,
					position: spawnPosition,
				},
			}),
		);
		const committed = updateDesignStudio(
			began,
			Action.EditorEditSessionCommitted(),
		);
		const resumed = updateDesignStudio(committed, Action.EditorToggled());

		expect(committed.positions.get(player)).toEqual(livePlayerPosition);
		expect(committed.characterSpawns.get(player)).toEqual(spawnPosition);
		expect(resumed.positions.get(player)).toEqual(spawnPosition);
		expect(resumed.positions.get(lavaMonster)).toEqual(liveMonsterPosition);
	});

	test("supports zero or one player and any number of Lava Monster Character Spawns", () => {
		const editing = updateDesignStudio(initialWorld, Action.EditorToggled());
		const duplicatePlayer = updateDesignStudio(
			editing,
			Action.EditorItemAdded({
				kind: CharacterSpawnKinds.Player,
				position: Position.make({ x: 350, y: 500 }),
			}),
		);
		const extraMonster = updateDesignStudio(
			editing,
			Action.EditorItemAdded({
				kind: CharacterSpawnKinds.LavaMonster,
				position: Position.make({ x: 750, y: 520 }),
			}),
		);
		const selected = extraMonster.editor.selected;
		expect(duplicatePlayer.editor.invalidPlacement).toEqual({ kind: "new" });
		expect(
			[...extraMonster.characters.values()].filter(
				(character) => character.kind === CharacterKinds.LavaMonster,
			),
		).toHaveLength(2);
		if (selected === null || selected === "floor") return;
		const removed = updateDesignStudio(
			{ ...editing, editor: { ...editing.editor, selected: EntityId(1) } },
			Action.EditorDeleteSelected(),
		);
		expect(
			[...removed.characters.values()].some(
				(character) => character.kind === CharacterKinds.Player,
			),
		).toBe(false);
	});
});
