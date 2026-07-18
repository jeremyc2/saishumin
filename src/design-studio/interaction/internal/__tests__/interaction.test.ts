import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Action, type Action as AppAction } from "../../../../app/action";
import {
	beginEditSession,
	cancelEditSession,
	commitEditSession,
	previewEditSession,
} from "../../../edit-session/edit-session";
import { EntityId } from "../../../../world/entity-id";
import { initialWorld } from "../../../../world/initial-world";
import type { World } from "../../../../world/world";
import { makeDesignStudioInteraction } from "../interaction";

type BrowserHarness = {
	readonly runFrame: (time: number) => void;
	readonly dispatchWindowEvent: (type: string, event: Event) => void;
};

const withBrowserHarness = <Result>(
	run: (harness: BrowserHarness) => Promise<Result>,
): Promise<Result> => {
	const globalRecord = globalThis as unknown as Record<string, unknown>;
	const names = [
		"window",
		"document",
		"SVGSVGElement",
		"requestAnimationFrame",
		"cancelAnimationFrame",
	] as const;
	const originals = new Map(
		names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	);
	const listeners = new Map<string, Set<EventListener>>();
	const frames: Array<FrameRequestCallback> = [];
	let nextFrameId = 1;
	globalRecord["window"] = {
		matchMedia: () => ({ matches: true }),
		addEventListener: (type: string, listener: EventListener) => {
			const typeListeners = listeners.get(type) ?? new Set<EventListener>();
			typeListeners.add(listener);
			listeners.set(type, typeListeners);
		},
		removeEventListener: (type: string, listener: EventListener) => {
			listeners.get(type)?.delete(listener);
		},
	};
	globalRecord["document"] = {
		querySelector: () => null,
		elementFromPoint: () => null,
	};
	globalRecord["SVGSVGElement"] = class {};
	globalRecord["requestAnimationFrame"] = (callback: FrameRequestCallback) => {
		frames.push(callback);
		const frameId = nextFrameId;
		nextFrameId += 1;
		return frameId;
	};
	globalRecord["cancelAnimationFrame"] = () => {};
	const restoreGlobals = (): void => {
		for (const name of names) {
			const descriptor = originals.get(name);
			if (descriptor === undefined) delete globalRecord[name];
			else Object.defineProperty(globalThis, name, descriptor);
		}
	};
	try {
		return run({
			runFrame: (time) => {
				const frame = frames.shift();
				if (frame === undefined) throw new Error("No animation frame scheduled");
				frame(time);
			},
			dispatchWindowEvent: (type, event) => {
				for (const listener of listeners.get(type) ?? []) listener(event);
			},
		}).finally(restoreGlobals);
	} catch (error) {
		restoreGlobals();
		throw error;
	}
};

const editingWorld = (selected: EntityId | null): World => ({
	...initialWorld,
	editor: { ...initialWorld.editor, open: true, selected },
});

const applyAction = (world: World, action: AppAction): World => {
	if (Action.$is("EditorSelectionChanged")(action))
		return {
			...world,
			editor: { ...world.editor, selected: action.selection },
		};
	if (Action.$is("EditorEditSessionBegan")(action))
		return beginEditSession(world, action.operation);
	if (Action.$is("EditorEditSessionPreviewed")(action))
		return previewEditSession(world, action.preview);
	if (Action.$is("EditorEditSessionCommitted")(action))
		return commitEditSession(world);
	if (Action.$is("EditorEditSessionCancelled")(action))
		return cancelEditSession(world);
	if (Action.$is("EditorCameraChanged")(action))
		return {
			...world,
			editor: { ...world.editor, camera: action.camera },
		};
	return world;
};

describe("mobile Design Studio interaction", () => {
	for (const mode of ["move", "resize"] as const) {
		test(`moves the selected entity with the joystick in ${mode} mode`, () =>
			withBrowserHarness(({ runFrame }) =>
				Effect.runPromise(
					Effect.scoped(
						Effect.gen(function* () {
							const selected = EntityId(2);
							let world = editingWorld(selected);
							const originalPosition = world.positions.get(selected);
							if (originalPosition === undefined)
								throw new Error("Expected selected entity position");
							let interaction = yield* makeDesignStudioInteraction({
								refresh: () => {},
								refreshPreview: () => {},
							});
							const dispatch = (action: AppAction): void => {
								world = applyAction(world, action);
								interaction.update(world, dispatch);
							};
							interaction.update(world, dispatch);
							if (mode === "resize") interaction.toggleTouchEditorMode();
							interaction.updateTouchJoystick({
								pointerId: 11,
								vector: { x: 1, y: 0 },
							});
							runFrame(0);
							runFrame(16);
							runFrame(32);

							const operation = world.editor.editSession?.operation;
							expect(operation?.kind).toBe("move");
							if (operation?.kind !== "move") return;
							expect(operation.position.x).toBeGreaterThan(originalPosition.x);
							expect(interaction.touchEditorMode()).toBe(mode);
						}),
					),
				),
			));
	}

	test("pans the camera with the joystick when nothing is selected and stops on release", () =>
		withBrowserHarness(({ runFrame, dispatchWindowEvent }) =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						let world = editingWorld(null);
						const actions: Array<AppAction> = [];
						let interaction = yield* makeDesignStudioInteraction({
							refresh: () => {},
							refreshPreview: () => {},
						});
						const dispatch = (action: AppAction): void => {
							actions.push(action);
							world = applyAction(world, action);
							interaction.update(world, dispatch);
						};
						interaction.update(world, dispatch);
						interaction.updateTouchJoystick({
							pointerId: 19,
							vector: { x: 1, y: 0 },
						});
						runFrame(0);
						runFrame(16);
						expect(
							actions.some(Action.$is("EditorCameraChanged")),
						).toBe(true);

						dispatchWindowEvent("pointerup", {
							pointerId: 19,
						} as PointerEvent);
						actions.length = 0;
						runFrame(32);
						runFrame(48);
						expect(
							actions.some(Action.$is("EditorCameraChanged")),
						).toBe(false);
					}),
				),
			),
		));

	test("Cancel clears the active edit and selection while Details opens", () =>
		withBrowserHarness(() =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const selected = EntityId(2);
						let world = editingWorld(selected);
						let interaction = yield* makeDesignStudioInteraction({
							refresh: () => {},
							refreshPreview: () => {},
						});
						const dispatch = (action: AppAction): void => {
							world = applyAction(world, action);
							interaction.update(world, dispatch);
						};
						interaction.update(world, dispatch);
						interaction.openTouchDetails();
						expect(interaction.isTouchDetailsOpen()).toBe(true);

						interaction.closeTouchDetails();
						interaction.startTouchEntityMove(world, selected, dispatch);
						expect(world.editor.editSession).not.toBeNull();
						interaction.cancelTouchSelection();
						expect(world.editor.editSession).toBeNull();
						expect(world.editor.selected).toBeNull();
						expect(interaction.isTouchDetailsOpen()).toBe(false);
					}),
				),
			),
		));
});
