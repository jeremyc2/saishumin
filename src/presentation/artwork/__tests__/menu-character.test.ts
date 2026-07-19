import { describe, expect, test } from "bun:test";
import { menuCharacterTemplate } from "../menu-character";

describe("menu character", () => {
	test("keeps both animated legs attached to fixed points beneath the body", () => {
		const character = menuCharacterTemplate({ variant: "splash" });
		const markup = [
			...character.strings,
			...character.values.filter(
				(value): value is string => typeof value === "string",
			),
		].join("");

		expect(markup).toContain(
			'data-leg-anchor="left" transform="translate(-11 33)"',
		);
		expect(markup).toContain(
			'data-leg-anchor="right" transform="translate(11 33)"',
		);
		expect(markup).toContain('data-leg-segment="left" d="M 0 0');
		expect(markup).toContain('data-leg-segment="right" d="M 0 0');
	});

	test("draws the familiar player colors and the bottoms of both feet", () => {
		const character = menuCharacterTemplate({ variant: "splash" });
		const markup = [
			...character.strings,
			...character.values.filter(
				(value): value is string => typeof value === "string",
			),
		].join("");

		expect(markup).toContain("#f3ad50");
		expect(markup).toContain("#503b37");
		expect(markup).toContain("menu-character__sole--left");
		expect(markup).toContain("menu-character__sole--right");
		expect(markup).toContain('data-character-feature="visible-soles"');
		expect(markup).toContain(
			'data-character-expression="surprised-circle-mouth"',
		);
		expect(markup).toContain(
			'data-character-expression="angry-clenched-mouth"',
		);
	});

	test("plays the construction fall once and holds its final pose", () => {
		const character = menuCharacterTemplate({ variant: "construction" });

		expect(
			character.values.some(
				(value) =>
					typeof value === "string" &&
					value.includes("menu-character--construction") &&
					value.includes("[--menu-character-count:1]"),
			),
		).toBe(true);
		expect(
			character.values.some(
				(value) =>
					typeof value === "string" &&
					value.includes("[--menu-character-count:infinite]"),
			),
		).toBe(false);
	});
});
