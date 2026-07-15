import { describe, expect, test } from "bun:test";
import { Position } from "../../world/components";
import { initialWorld } from "../../world/initial-world";
import { playerEntity } from "../../world/world";
import { Action } from "../action";
import { completeWorldUpdate } from "../world-update";

describe("application World update", () => {
	test("updates the presentation camera after gameplay reaches a view edge", () => {
		const previous = {
			...initialWorld,
			gameCamera: Position.make({ x: 0, y: 0 }),
		};
		const updated = {
			...previous,
			positions: new Map(previous.positions).set(
				playerEntity,
				Position.make({ x: 1212.25, y: 320 }),
			),
		};

		const completed = completeWorldUpdate({
			previous,
			updated,
			action: Action.Tick({ time: 1050 }),
		});

		expect(completed.gameCamera.x).toBe(-152.25);
	});
});
