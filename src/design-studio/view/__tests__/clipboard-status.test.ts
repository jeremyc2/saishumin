import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { initialWorld } from "../../../world/initial-world";
import { loadClipboardWithStatus } from "../clipboard-status";

describe("clipboard button status", () => {
	test("completes loading and restores the button after a successful load", () => {
		const statuses: Array<{
			readonly label: string;
			readonly disabled: boolean;
		}> = [];
		let loaded = false;

		Effect.runSync(
			loadClipboardWithStatus({
				load: Effect.succeed(initialWorld),
				onLoaded: () => {
					loaded = true;
				},
				setStatus: (status) =>
					Effect.sync(() => {
						statuses.push(status);
					}),
			}),
		);

		expect(loaded).toBe(true);
		expect(statuses).toEqual([
			{ label: "LOADING…", disabled: true },
			{ label: "LOAD FROM CLIPBOARD", disabled: false },
		]);
	});
});
