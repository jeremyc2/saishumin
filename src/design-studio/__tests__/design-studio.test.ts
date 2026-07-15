import { describe, expect, test } from "bun:test";
import { Action } from "../../model/action";
import { Body, Position } from "../../world/components";
import { initialWorld } from "../../world/initial-world";
import { crateEntities } from "../../world/world";
import { updateDesignStudio } from "../design-studio";
import { EditorItemKinds } from "../model";

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
});
