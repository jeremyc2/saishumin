import { describe, expect, test } from "bun:test";
import { type AppScreen, AppScreens } from "../../../app/screen";
import { frontEndTemplate } from "../front-end";

const flattenedTemplate = (value: unknown): string => {
	if (Array.isArray(value)) return value.map(flattenedTemplate).join("");
	if (value === null || value === undefined) return "";
	if (typeof value !== "object") return String(value);
	if (!("strings" in value) || !("values" in value)) return "";
	const template = value as {
		readonly strings: ReadonlyArray<string>;
		readonly values: ReadonlyArray<unknown>;
	};
	return template.strings
		.map(
			(part, index) =>
				part +
				(index < template.values.length
					? flattenedTemplate(template.values[index])
					: ""),
		)
		.join("");
};

describe("front end", () => {
	test("uses the title card and animated egg hero on the splash screen", () => {
		const splash = flattenedTemplate(
			frontEndTemplate({ screen: AppScreens.Splash, navigate: () => {} }),
		);

		expect(splash).toContain("SAISHUMIN");
		expect(splash).toContain("data-menu-character=splash");
		expect(splash).toContain("data-front-terrain-platform");
		expect(splash).toContain("cobblestone dirt grass sand");
		expect(splash).not.toContain("SKIP INTRO");
		expect(splash).not.toContain("front-loading-dot");
		expect(splash).toContain(
			"animate-[front-splash-fade_3.2s_ease-in-out_both]",
		);
	});

	test("offers Story Mode above World Builder", () => {
		const destinations: Array<AppScreen> = [];
		const menu = frontEndTemplate({
			screen: AppScreens.MainMenu,
			navigate: (screen) => destinations.push(screen),
		});
		const markup = flattenedTemplate(menu);

		expect(markup.indexOf("STORY MODE")).toBeLessThan(
			markup.indexOf("WORLD BUILDER"),
		);
		expect(markup).toContain("BEGIN THE CAMPAIGN");
		expect(markup).toContain("FORGE YOUR OWN WAY");
	});

	test("shows the shared larger character and a way back from Story Mode", () => {
		const construction = flattenedTemplate(
			frontEndTemplate({ screen: AppScreens.StoryMode, navigate: () => {} }),
		);

		expect(construction).toContain("UNDER");
		expect(construction).toContain("CONSTRUCTION");
		expect(construction).toContain("data-menu-character=construction");
		expect(construction).toContain("BACK TO MAIN MENU");
	});
});
