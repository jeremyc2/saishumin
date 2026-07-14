import { describe, expect, test } from "bun:test";
import { crateShadowDepthOffset } from "./templates";

describe("crate shadows", () => {
	test("only offsets shadow sections below the supporting surface", () => {
		expect(crateShadowDepthOffset(62, 62)).toBe(0);
		expect(crateShadowDepthOffset(62, 0)).toBeGreaterThan(0);
	});
});
