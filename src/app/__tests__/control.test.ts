import { describe, expect, test } from "bun:test";
import { Controls, controlForKey } from "../control";

describe("controlForKey", () => {
	test("maps WASD to the corresponding arrow-key controls", () => {
		expect(controlForKey("w")).toBe(Controls.Up);
		expect(controlForKey("a")).toBe(Controls.Left);
		expect(controlForKey("s")).toBe(Controls.Down);
		expect(controlForKey("d")).toBe(Controls.Right);
	});

	test("accepts shifted letter controls", () => {
		expect(controlForKey("W")).toBe(Controls.Up);
		expect(controlForKey("X")).toBe(Controls.Interact);
	});
});
