import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Action, type Action as AppAction } from "../../../../app/action";
import { EntityId } from "../../../../world/entity-id";
import { initialWorld } from "../../../../world/initial-world";
import type { World } from "../../../../world/world";
import {
	beginEditSession,
	cancelEditSession,
	commitEditSession,
	previewEditSession,
} from "../../../edit-session/edit-session";
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
		names.map((name) => [
			name,
			Object.getOwnPropertyDescriptor(globalThis, name),
		]),
	);
	const listeners = new Map<string, Set<EventListener>>();
	const frames: Array<FrameRequestCallback> = [];
	let nextFrameId = 1;
	class FakeSvgElement {
		getScreenCTM() {
			return { a: 1, d: 1, inverse: () => ({}) };
		}
		createSVGPoint() {
			const point = {
				x: 0,
				y: 0,
				matrixTransform: () => ({ x: point.x, y: point.y }),
			};
			return point;
		}
		getBoundingClientRect() {
			return { left: 0, top: 0, width: 800, height: 600 };
		}
	}
	const canvas = new FakeSvgElement();
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
		querySelector: (selector: string) =>
			selector === "#world-canvas" ? canvas : null,
		elementFromPoint: () => null,
	};
	globalRecord["SVGSVGElement"] = FakeSvgElement;
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
				if (frame === undefined)
					throw new Error("No animation frame scheduled");
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
							const interaction = yield* makeDesignStudioInteraction({
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

	test("pans from an unselected entity without turning the drag into a selection click", () =>
		withBrowserHarness(({ dispatchWindowEvent }) =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const entity = EntityId(8);
						let world = editingWorld(null);
						const actions: Array<AppAction> = [];
						const interaction = yield* makeDesignStudioInteraction({
							refresh: () => {},
							refreshPreview: () => {},
						});
						const dispatch = (action: AppAction): void => {
							actions.push(action);
							world = applyAction(world, action);
							interaction.update(world, dispatch);
						};
						interaction.update(world, dispatch);
						interaction.startEntityMove(
							{
								button: 0,
								clientX: 100,
								clientY: 100,
								pointerId: 31,
								pointerType: "touch",
								timeStamp: 0,
								preventDefault: () => {},
								stopPropagation: () => {},
							} as unknown as PointerEvent,
							world,
							entity,
							dispatch,
						);
						dispatchWindowEvent("pointermove", {
							clientX: 124,
							clientY: 100,
							pointerId: 31,
							pointerType: "touch",
							timeStamp: 70,
							preventDefault: () => {},
						} as unknown as PointerEvent);

						expect(actions.some(Action.$is("EditorCameraChanged"))).toBe(true);
						expect(interaction.consumeTouchGestureClick()).toBe(true);
						expect(interaction.consumeTouchGestureClick()).toBe(false);
					}),
				),
			),
		));

	test("pans the camera with the joystick when nothing is selected and stops on release", () =>
		withBrowserHarness(({ runFrame, dispatchWindowEvent }) =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						let world = editingWorld(null);
						const actions: Array<AppAction> = [];
						const interaction = yield* makeDesignStudioInteraction({
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
						expect(actions.some(Action.$is("EditorCameraChanged"))).toBe(true);

						dispatchWindowEvent("pointerup", {
							pointerId: 19,
						} as PointerEvent);
						actions.length = 0;
						runFrame(32);
						runFrame(48);
						expect(actions.some(Action.$is("EditorCameraChanged"))).toBe(false);
					}),
				),
			),
		));

	test("switches a selected move from joystick to touch without panning or committing", () =>
		withBrowserHarness(({ runFrame, dispatchWindowEvent }) =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const selected = EntityId(8);
						let world = editingWorld(selected);
						const originalPosition = world.positions.get(selected);
						if (originalPosition === undefined)
							throw new Error("Expected selected entity position");
						const actions: Array<AppAction> = [];
						const interaction = yield* makeDesignStudioInteraction({
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
							pointerId: 41,
							vector: { x: 1, y: 0 },
						});
						runFrame(0);
						runFrame(16);
						runFrame(32);
						interaction.updateTouchJoystick({ pointerId: 41, vector: null });
						const operationBeforeTouch = world.editor.editSession?.operation;
						if (operationBeforeTouch?.kind !== "move")
							throw new Error("Expected joystick move Edit Session");
						let stopped = false;
						const pointerDown = {
							button: 0,
							clientX: 650,
							clientY: 470,
							pointerId: 42,
							pointerType: "touch",
							timeStamp: 100,
							preventDefault: () => {},
							stopPropagation: () => {
								stopped = true;
							},
						} as unknown as PointerEvent;
						interaction.startEntityMove(pointerDown, world, selected, dispatch);
						if (!stopped) interaction.startPan(pointerDown, world);
						actions.length = 0;
						dispatchWindowEvent("pointermove", {
							clientX: 700,
							clientY: 470,
							pointerId: 42,
							pointerType: "touch",
							timeStamp: 200,
							preventDefault: () => {},
						} as unknown as PointerEvent);

						expect(actions.some(Action.$is("EditorCameraChanged"))).toBe(false);
						expect(actions.some(Action.$is("EditorEditSessionPreviewed"))).toBe(
							true,
						);
						dispatchWindowEvent("pointerup", {
							pointerId: 42,
						} as PointerEvent);
						expect(world.editor.editSession).not.toBeNull();
						const operationAfterTouch = world.editor.editSession?.operation;
						if (operationAfterTouch?.kind !== "move") return;
						expect(operationAfterTouch.originalPosition).toEqual(
							originalPosition,
						);
					}),
				),
			),
		));

	test("Done commits the active edit and clears selection while Details opens", () =>
		withBrowserHarness(() =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const selected = EntityId(2);
						let world = editingWorld(selected);
						const interaction = yield* makeDesignStudioInteraction({
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
						const position = world.positions.get(selected);
						const body = world.bodies.get(selected);
						if (position === undefined || body === undefined)
							throw new Error("Expected selected entity geometry");
						world = beginEditSession(world, {
							kind: "move",
							entity: selected,
							originalPosition: position,
							originalBody: body,
							position,
						});
						interaction.update(world, dispatch);
						expect(world.editor.editSession).not.toBeNull();
						interaction.finishTouchInteraction();
						expect(world.editor.editSession).toBeNull();
						expect(world.editor.selected).toBeNull();
						expect(interaction.isTouchDetailsOpen()).toBe(false);
					}),
				),
			),
		));

	test("committing a touch placement does not reopen the Object Palette", () =>
		withBrowserHarness(() =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						let world = editingWorld(null);
						const interaction = yield* makeDesignStudioInteraction({
							refresh: () => {},
							refreshPreview: () => {},
						});
						const dispatch = (action: AppAction): void => {
							world = applyAction(world, action);
							interaction.update(world, dispatch);
						};
						interaction.update(world, dispatch);
						interaction.startTouchPalettePlacement("plant", world, dispatch);
						expect(world.editor.editSession).not.toBeNull();

						interaction.finishTouchInteraction();

						expect(world.editor.editSession).toBeNull();
						expect(interaction.isTouchPanelOpen()).toBe(false);
					}),
				),
			),
		));

	test("Done releases an invalid move and cancellation restores its authored origin", () =>
		withBrowserHarness(() =>
			Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const selected = EntityId(8);
						let world = editingWorld(selected);
						const originalPosition = world.positions.get(selected);
						const body = world.bodies.get(selected);
						if (originalPosition === undefined || body === undefined)
							throw new Error("Expected selected entity geometry");
						const interaction = yield* makeDesignStudioInteraction({
							refresh: () => {},
							refreshPreview: () => {},
						});
						const dispatch = (action: AppAction): void => {
							world = applyAction(world, action);
							interaction.update(world, dispatch);
						};
						interaction.update(world, dispatch);
						dispatch(
							Action.EditorEditSessionBegan({
								operation: {
									kind: "move",
									entity: selected,
									originalPosition,
									originalBody: body,
									position: { x: -1_000, y: -1_000 },
								},
							}),
						);

						interaction.finishTouchInteraction();

						expect(world.editor.editSession?.phase).toBe("invalid-released");
						expect(world.editor.selected).toBeNull();
						dispatch(Action.EditorEditSessionCancelled());
						expect(world.editor.editSession).toBeNull();
						expect(world.positions.get(selected)).toEqual(originalPosition);
					}),
				),
			),
		));
});
