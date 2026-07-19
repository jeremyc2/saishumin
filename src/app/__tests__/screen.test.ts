import { describe, expect, test } from "bun:test";
import {
	reducedMotionSplashDurationMilliseconds,
	splashDuration,
	splashDurationMilliseconds,
} from "../screen";

describe("splash duration", () => {
	test("keeps the full title-card animation when motion is allowed", () => {
		expect(splashDuration(false)).toBe(splashDurationMilliseconds);
	});

	test("moves promptly to the main menu when reduced motion is preferred", () => {
		expect(splashDuration(true)).toBe(reducedMotionSplashDurationMilliseconds);
	});
});
