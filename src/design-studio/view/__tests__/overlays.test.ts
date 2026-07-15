import { describe, expect, test } from "bun:test";
import { invalidPreviewDescription } from "../overlays";

describe("Invalid Preview presentation", () => {
	test("explains why a floor resize cannot be committed", () => {
		expect(
			invalidPreviewDescription({
				rejectionReason: "floor-excludes-editor-item",
				invalidPlacementKind: "floor",
				occupiedSupport: false,
			}),
		).toBe("The floor plan must contain every existing object.");
	});

	test("explains when an item must be moved off its support", () => {
		expect(
			invalidPreviewDescription({
				rejectionReason: "occupied-support",
				invalidPlacementKind: "entity",
				occupiedSupport: true,
			}),
		).toBe(
			"Move every object off this platform before moving or shrinking it.",
		);
	});
});
