import { describe, expect, test } from "bun:test";
import {
	beginEditSession,
	cancelEditSession,
	commitEditSession,
	editSessionView,
	previewEditSession,
} from "../edit-session";
import { EditorItemKinds } from "../../model";
import { Position } from "../../../world/components";
import { initialWorld } from "../../../world/initial-world";

const editingWorld = {
	...initialWorld,
	editor: { ...initialWorld.editor, open: true },
};

describe("Edit Session", () => {
	test("keeps a valid preview separate from the Authored Room until commit", () => {
		const position = Position.make({ x: 300, y: 200 });
		const preview = previewEditSession(
			beginEditSession(editingWorld, {
				kind: "create",
				itemKind: EditorItemKinds.Plant,
				position,
			}),
			{ kind: "create", position },
		);

		expect(preview.editor.editSession).not.toBeNull();
		expect(preview.positions.size).toBe(editingWorld.positions.size);
		expect(editSessionView(preview).positions.size).toBe(
			editingWorld.positions.size + 1,
		);

		const committed = commitEditSession(preview);
		expect(committed.editor.editSession).toBeNull();
		expect(committed.positions.size).toBe(editingWorld.positions.size + 1);
	});

	test("keeps an Invalid Preview visible after release without changing the Authored Room", () => {
		const invalid = beginEditSession(editingWorld, {
			kind: "create",
			itemKind: EditorItemKinds.Plant,
			position: Position.make({ x: 0, y: 0 }),
		});

		const released = commitEditSession(invalid);
		expect(released.editor.editSession?.validity.kind).toBe("invalid");
		expect(released.editor.editSession?.phase).toBe("invalid-released");
		expect(released.positions).toBe(editingWorld.positions);
	});

	test("cancels a preview without changing the Authored Room", () => {
		const editing = beginEditSession(editingWorld, {
			kind: "create",
			itemKind: EditorItemKinds.Plant,
			position: Position.make({ x: 300, y: 200 }),
		});

		const cancelled = cancelEditSession(editing);
		expect(cancelled.editor.editSession).toBeNull();
		expect(cancelled.positions).toBe(editingWorld.positions);
	});
});
