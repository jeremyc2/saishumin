import { describe, expect, test } from "bun:test";
import { Action, type Action as AppAction } from "../../../app/action";
import { editSessionStatus } from "../../../design-studio/edit-session/edit-session";
import {
	editorEntitySelectionBody,
	makeDesignStudioView,
} from "../../../design-studio/view/view";
import {
	Body,
	Character,
	CharacterKinds,
	Decoration,
	DecorationKinds,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { playerBody, playerEntityIn, type World } from "../../../world/world";
import { gameSceneTemplate } from "../game-scene";
import { mobileControlsTemplate } from "../mobile-controls";

const templateResult = (value: unknown) => {
	if (value === null || typeof value !== "object") return undefined;
	if (!("strings" in value) || !("values" in value)) return undefined;
	return value as {
		readonly strings: ReadonlyArray<string>;
		readonly values: ReadonlyArray<unknown>;
	};
};

const findTemplate = (
	value: unknown,
	marker: string,
): ReturnType<typeof templateResult> => {
	const template = templateResult(value);
	if (template === undefined) return undefined;
	if (
		template.strings.join("").includes(marker) ||
		template.values.includes(marker)
	)
		return template;
	for (const child of template.values) {
		if (Array.isArray(child)) {
			for (const item of child) {
				const found = findTemplate(item, marker);
				if (found !== undefined) return found;
			}
			continue;
		}
		const found = findTemplate(child, marker);
		if (found !== undefined) return found;
	}
	return undefined;
};

const clickHandlerBefore = (
	template: NonNullable<ReturnType<typeof templateResult>>,
	marker: string,
) => {
	const markerIndex = template.values.indexOf(marker);
	const handler = template.values[markerIndex - 1];
	if (typeof handler !== "function") throw new Error("Missing click handler");
	return handler as () => void;
};

const pointerDownHandlerAfter = (
	template: NonNullable<ReturnType<typeof templateResult>>,
	marker: string,
) => {
	const markerIndex = template.strings.findIndex((part) =>
		part.includes(marker),
	);
	if (markerIndex < 0) throw new Error(`Missing ${marker}`);
	for (let index = markerIndex; index < template.strings.length; index += 1) {
		if (template.strings[index]?.includes("@pointerdown=") !== true) continue;
		const handler = template.values[index];
		if (typeof handler !== "function")
			throw new Error(`Missing ${marker} pointer-down handler`);
		return handler as (event: PointerEvent) => void;
	}
	throw new Error(`Missing ${marker} pointer-down binding`);
};

const interaction = {
	startPan: () => {},
	startEntityMove: () => {},
	startEntityResize: () => {},
	startFloorResize: () => {},
	startPaletteDrag: () => {},
	startTouchPalettePlacement: () => {},
	selectTouchEntity: () => {},
	updateTouchJoystick: () => {},
	finishTouchInteraction: () => {},
	touchEditorMode: () => "move" as const,
	toggleTouchEditorMode: () => {},
	consumeTouchGestureClick: () => false,
	toggleTouchPanel: () => {},
	isTouchPanelOpen: () => true,
	openTouchDetails: () => {},
	closeTouchDetails: () => {},
	isTouchDetailsOpen: () => false,
	usesTouchControls: () => false,
	zoom: () => 1,
	zoomAt: () => {},
	update: () => {},
	dismissPalettePopover: () => {},
	isPanGesture: () => false,
	isGestureActive: () => false,
	createPreview: () => null,
	palettePopover: () => null,
} as const;

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

describe("game scene", () => {
	test("keeps a plant selection outline around its visual ground footprint", () => {
		const plant = EntityId(50);
		const position = Position.make({ x: 500, y: 300 });
		const body = Body.make({ width: 72, depth: 72 });
		const artworkScale = (body.width + body.depth) / 140;
		const visualFootprint = Body.make({
			width: 52 * artworkScale,
			depth: (18 * artworkScale) / Math.SQRT1_2,
		});
		const world = {
			...initialWorld,
			positions: new Map([[plant, position]]),
			bodies: new Map([[plant, body]]),
			decorations: new Map([
				[plant, Decoration.make({ kind: DecorationKinds.Plant, height: 84 })],
			]),
			characters: new Map(),
			editor: { ...initialWorld.editor, open: true, selected: plant },
		};
		expect(editorEntitySelectionBody({ world, entity: plant })).toEqual(
			visualFootprint,
		);
	});

	test("paints an elevated Character Spawn after its supporting platform", () => {
		const player = EntityId(1);
		const platform = EntityId(2);
		const position = Position.make({ x: 500, y: 300 });
		const platformBody = Body.make({ width: 260, depth: 180 });
		const world = {
			...initialWorld,
			positions: new Map([
				[player, position],
				[platform, position],
			]),
			bodies: new Map([
				[player, playerBody],
				[platform, platformBody],
			]),
			obstacles: new Map([
				[platform, Obstacle.make({ kind: ObstacleKinds.Platform, height: 48 })],
			]),
			decorations: new Map(),
			characters: new Map([
				[
					player,
					Character.make({
						kind: CharacterKinds.Player,
						facing: PlayerFacings.Down,
					}),
				],
			]),
			characterSpawns: new Map([[player, position]]),
			editor: { ...initialWorld.editor, open: true },
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);
		const platformIndex = scene.indexOf("#77927e");
		const spawnIndex = scene.indexOf("data-character-spawn=player");

		expect(platformIndex).toBeGreaterThan(-1);
		expect(spawnIndex).toBeGreaterThan(-1);
		expect(spawnIndex).toBeGreaterThan(platformIndex);
	});

	test("composes the room scene without owning DOM rendering", () => {
		const scene = gameSceneTemplate({
			world: initialWorld,
			editSessionStatus: editSessionStatus(initialWorld),
			dispatch: () => {},
			interaction,
			designStudioView: makeDesignStudioView(interaction),
			onRootPointerDown: () => {},
		});

		expect(scene.strings.join("")).toContain('id="world-canvas"');
		expect(scene.strings.join("")).toContain("SAISHUMIN");
		expect(scene.strings.join("")).toContain("data-floor-base");
		expect(scene.strings.join("")).not.toContain("document.");
	});

	test("includes touch controls and fills narrow screens during play", () => {
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world: initialWorld,
				editSessionStatus: editSessionStatus(initialWorld),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);

		const controls = flattenedTemplate(
			mobileControlsTemplate({
				world: initialWorld,
				interaction,
				dispatch: () => {},
			}),
		);
		expect(scene).toContain("preserveAspectRatio=xMidYMid slice");
		expect(scene).toContain("Movement joystick");
		expect(scene).toContain("Grab or interact");
		expect(scene).toContain("Jump");
		expect(scene).toContain("EDIT");
		expect(controls).toContain("Touch controls");
		expect(controls).toContain("Movement joystick");
		expect(controls).toContain("Action controls");
		expect(controls).toContain("bottom-0 left-0");
		expect(controls).toContain("top-0 right-0");
		expect(controls).toContain("size-16");
		expect(controls).toContain("text-2xl");
		expect(controls).not.toContain("max-[380px]:rounded-[0.85rem]");
		expect(controls).not.toContain("activePointer === event.pointerId");
	});

	test("shows the player's interaction cue only when a contextual target is available", () => {
		const player = playerEntityIn(initialWorld);
		if (player === undefined) throw new Error("Expected player Character");
		const playerPosition = initialWorld.positions.get(player);
		const playerCharacter = initialWorld.characters.get(player);
		if (playerPosition === undefined || playerCharacter === undefined)
			throw new Error("Expected player state");
		const sign = EntityId(999);
		const signBody = Body.make({ width: 88, depth: 56 });
		const signPosition = Position.make({
			x: playerPosition.x,
			y: playerPosition.y - (signBody.depth + playerBody.depth) / 2,
		});
		const world = {
			...initialWorld,
			positions: new Map(initialWorld.positions).set(sign, signPosition),
			bodies: new Map(initialWorld.bodies).set(sign, signBody),
			decorations: new Map(initialWorld.decorations).set(
				sign,
				Decoration.make({ kind: DecorationKinds.Sign, height: 104 }),
			),
			characters: new Map(initialWorld.characters).set(player, {
				...playerCharacter,
				facing: PlayerFacings.Up,
			}),
		};
		const render = (nextWorld: typeof world): string =>
			flattenedTemplate(
				gameSceneTemplate({
					world: nextWorld,
					editSessionStatus: editSessionStatus(nextWorld),
					dispatch: () => {},
					interaction,
					designStudioView: makeDesignStudioView(interaction),
					onRootPointerDown: () => {},
				}),
			);

		expect(render(world)).toContain("data-player-interaction-cue");
		expect(
			render({
				...world,
				characters: new Map(world.characters).set(player, {
					...playerCharacter,
					facing: PlayerFacings.Down,
				}),
			}),
		).not.toContain("data-player-interaction-cue");
	});

	test("keeps the full canvas visible while editing", () => {
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true },
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("preserveAspectRatio=xMidYMid meet");
		expect(scene).toContain("any-pointer-coarse:translate-y-0");
		expect(scene).toContain("TAP TO PLACE");
		expect(scene).toContain("Objects");
		expect(scene).toContain("any-pointer-coarse:landscape:grid-cols-4");
		expect(scene).not.toContain(" gap-2 landscape:grid-cols-4");
		expect(scene).not.toContain("data-panel-visible");
		expect(scene).not.toContain("Grab or interact");
	});

	test("finishes a pending mobile edit before Play", () => {
		const selected = EntityId(8);
		const position = initialWorld.positions.get(selected);
		const body = initialWorld.bodies.get(selected);
		if (position === undefined || body === undefined)
			throw new Error("Expected selected Entity geometry");
		const world = {
			...initialWorld,
			editor: {
				...initialWorld.editor,
				open: true,
				selected,
				editSession: {
					operation: {
						kind: "move" as const,
						entity: selected,
						originalPosition: position,
						originalBody: body,
						position: { x: position.x + 20, y: position.y },
					},
					validity: { kind: "valid" as const },
					phase: "active" as const,
				},
			},
		};
		const events: Array<string> = [];
		const touchInteraction = {
			...interaction,
			usesTouchControls: () => true,
			finishTouchInteraction: () => {
				events.push("finish");
			},
		};
		const scene = gameSceneTemplate({
			world,
			editSessionStatus: editSessionStatus(world),
			dispatch: (action) => {
				if (Action.$is("EditorToggled")(action)) events.push("play");
			},
			interaction: touchInteraction,
			designStudioView: makeDesignStudioView(touchInteraction),
			onRootPointerDown: () => {},
		});
		const play = findTemplate(scene, "PLAY");
		if (play === undefined) throw new Error("Missing Play button");

		clickHandlerBefore(play, "PLAY")();

		expect(events).toEqual(["finish", "play"]);
	});

	test("keeps Done, Details, and the target mode visible during a touch edit", () => {
		const world = {
			...initialWorld,
			editor: {
				...initialWorld.editor,
				open: true,
				editSession: {
					operation: {
						kind: "create" as const,
						itemKind: "crate" as const,
						position: { x: 500, y: 300 },
					},
					validity: { kind: "valid" as const },
					phase: "active" as const,
				},
			},
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView: makeDesignStudioView(touchInteraction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("Movement joystick");
		expect(scene).toContain("DONE");
		expect(scene).toContain("DETAILS");
		expect(scene).toContain("RESIZE");
		expect(scene).not.toContain("CANCEL");
		expect(scene).not.toContain("Grab or interact");
	});

	test("offers Done, Details, and the target mode for a touch selection", () => {
		const selected = EntityId(8);
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true, selected },
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
		};
		const designStudioView = makeDesignStudioView(touchInteraction);
		const selection = flattenedTemplate(
			designStudioView.selectionTemplate(world, false, () => {}),
		);
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView,
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("DONE");
		expect(scene).toContain("DETAILS");
		expect(scene).toContain("RESIZE");
		expect(scene).not.toContain("CANCEL");
		expect(scene).toContain("data-touch-move-target");
		expect(selection).toContain("data-touch-move-highlight");
		expect(selection).toContain("data-touch-move-indicator");
		const firstHandle = selection.indexOf("data-selection-handle");
		expect(firstHandle).toBeGreaterThanOrEqual(0);
		expect(selection.slice(firstHandle, firstHandle + 500)).toContain(
			"any-pointer-coarse:hidden",
		);
		expect(scene).toContain('stroke-width="128"');
		expect(scene).toContain("data-touch-details");
	});

	test("offers Move while Resize mode is active", () => {
		const selected = EntityId(8);
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true, selected },
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
			touchEditorMode: () => "resize" as const,
		};
		const designStudioView = makeDesignStudioView(touchInteraction);
		const selection = flattenedTemplate(
			designStudioView.selectionTemplate(world, false, () => {}),
		);
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView,
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("MOVE");
		expect(scene).toContain("data-touch-resize-target");
		expect(selection).not.toContain("data-touch-move-highlight");
		expect(selection).not.toContain("data-touch-move-indicator");
		const firstHandle = selection.indexOf("data-selection-handle");
		expect(firstHandle).toBeGreaterThanOrEqual(0);
		expect(selection.slice(firstHandle, firstHandle + 500)).not.toContain(
			"any-pointer-coarse:hidden",
		);
		expect(scene).toContain('stroke-width="128"');
	});

	test("uses a painted edge band for mobile floor resizing", () => {
		const world = {
			...initialWorld,
			editor: {
				...initialWorld.editor,
				open: true,
				selected: "floor" as const,
			},
		};
		const touchInteraction = {
			...interaction,
			touchEditorMode: () => "resize" as const,
		};
		const selection = flattenedTemplate(
			makeDesignStudioView(touchInteraction).selectionTemplate(
				world,
				false,
				() => {},
			),
		);
		const touchTargetIndex = selection.indexOf("data-touch-resize-target");

		expect(touchTargetIndex).toBeGreaterThanOrEqual(0);
		const touchTarget = selection.slice(
			touchTargetIndex,
			touchTargetIndex + 500,
		);
		expect(touchTarget).toContain('stroke="#000"');
		expect(touchTarget).toContain('stroke-opacity="0.001"');
		expect(touchTarget).toContain('pointer-events="stroke"');
	});

	test("routes a coarse-pointer floor-edge touch to resize instead of pan", () => {
		const world = {
			...initialWorld,
			editor: {
				...initialWorld.editor,
				open: true,
				selected: "floor" as const,
			},
		};
		const resizeStarts: Array<readonly [number, number]> = [];
		let panStarts = 0;
		const touchInteraction = {
			...interaction,
			touchEditorMode: () => "resize" as const,
			usesTouchControls: () => true,
			startPan: () => {
				panStarts += 1;
			},
			startFloorResize: (
				_event: PointerEvent,
				_world: World,
				widthDirection: -1 | 0 | 1,
				depthDirection: -1 | 0 | 1,
				_dispatch: (action: AppAction) => void,
			) => {
				resizeStarts.push([widthDirection, depthDirection]);
			},
		};
		const scene = gameSceneTemplate({
			world,
			editSessionStatus: editSessionStatus(world),
			dispatch: () => {},
			interaction: touchInteraction,
			designStudioView: makeDesignStudioView(touchInteraction),
			onRootPointerDown: () => {},
		});
		const floorPointerDown = pointerDownHandlerAfter(scene, "data-floor-base");
		const canvasPointerDown = pointerDownHandlerAfter(
			scene,
			'id="world-canvas"',
		);
		const currentTarget = {
			getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
		};

		floorPointerDown({
			button: 0,
			clientX: 800,
			clientY: 224,
			pointerType: "touch",
			currentTarget,
			preventDefault: () => {},
			stopPropagation: () => {},
		} as unknown as PointerEvent);
		canvasPointerDown({
			button: 0,
			clientX: 800,
			clientY: 216,
			pointerType: "touch",
			currentTarget,
			preventDefault: () => {},
			stopPropagation: () => {},
		} as unknown as PointerEvent);
		canvasPointerDown({
			button: 0,
			clientX: 800,
			clientY: 450,
			pointerType: "touch",
			currentTarget,
			preventDefault: () => {},
			stopPropagation: () => {},
		} as unknown as PointerEvent);

		expect(resizeStarts).toEqual([
			[0, -1],
			[0, -1],
		]);
		expect(panStarts).toBe(1);
	});
});
