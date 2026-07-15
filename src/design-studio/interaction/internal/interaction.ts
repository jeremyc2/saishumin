import { Effect, type Scope } from "effect";
import { Action, type Action as AppAction } from "../../../app/action";
import { unproject } from "../../../presentation/geometry/projection";
import {
	type ResizeDirection,
	resizeFromHandle,
} from "../../../presentation/geometry/resize";
import type { Body, Position } from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import { entityBaseElevation } from "../../../world/spatial/elevation";
import {
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	type World,
} from "../../../world/world";
import {
	editorItemKindForEntity,
	editSessionView,
	maximumEditorBody,
} from "../../edit-session/edit-session";
import { defaultEditorItemBody, type EditorItemKind } from "../../model";
import { editorPlacementPositionAtPointer } from "../placement";
import {
	autoPanCamera,
	contentEnvelope,
	contentEnvelopeIncludingPreview,
	dismissPalettePopover,
	floorResizePointerDelta,
	initialDesignStudioInteraction,
	movePalettePress,
	pressPaletteItem,
	releasePalettePress,
	visiblePalettePopover,
} from "../pointer";

type Dispatch = (action: AppAction) => void;

type ActiveInteraction =
	| {
			readonly kind: "pan";
			readonly pointer: Position;
			readonly camera: Position;
	  }
	| {
			readonly kind: "move";
			readonly entity: EntityId;
			readonly grabOffset: Position;
			readonly position: Position;
			readonly body: Body;
	  }
	| {
			readonly kind: "resize";
			readonly entity: EntityId;
			readonly pointer: Position;
			readonly position: Position;
			readonly body: Body;
			readonly widthDirection: ResizeDirection;
			readonly depthDirection: ResizeDirection;
	  }
	| {
			readonly kind: "create";
			readonly itemKind: EditorItemKind;
			readonly pointer: Position;
			readonly position: Position;
			readonly canDrop: boolean;
	  }
	| {
			readonly kind: "resize-floor";
			readonly pointer: Position;
			readonly floorPlan: Body;
			readonly widthDirection: ResizeDirection;
			readonly depthDirection: ResizeDirection;
			readonly originalFloorOrigin: Position;
	  };

const minimumEntityBody = {
	width: minimumEntityExtent,
	depth: minimumEntityExtent,
} as const;
const minimumFloorBody = {
	width: minimumFloorWidth,
	depth: minimumFloorDepth,
} as const;
const maximumFloorBody = {
	width: Number.POSITIVE_INFINITY,
	depth: Number.POSITIVE_INFINITY,
} as const;
const wheelLinePixels = 16;

export type DesignStudioInteraction = {
	readonly startPan: (event: PointerEvent, world: World) => void;
	readonly startEntityMove: (
		event: PointerEvent,
		world: World,
		entity: EntityId,
		dispatch: Dispatch,
	) => void;
	readonly startEntityResize: (
		event: PointerEvent,
		world: World,
		entity: EntityId,
		widthDirection: ResizeDirection,
		depthDirection: ResizeDirection,
		dispatch: Dispatch,
	) => void;
	readonly startFloorResize: (
		event: PointerEvent,
		world: World,
		widthDirection: ResizeDirection,
		depthDirection: ResizeDirection,
		dispatch: Dispatch,
	) => void;
	readonly startPaletteDrag: (
		event: PointerEvent,
		itemKind: EditorItemKind,
		world: World,
	) => void;
	readonly update: (world: World, dispatch: Dispatch) => void;
	readonly dismissPalettePopover: () => void;
	readonly isPanGesture: (event: PointerEvent) => boolean;
	readonly isGestureActive: () => boolean;
	readonly createPreview: () => {
		readonly itemKind: EditorItemKind;
		readonly position: Position;
		readonly canDrop: boolean;
	} | null;
	readonly palettePopover: () => {
		readonly left: number;
		readonly top: number;
		readonly fading: boolean;
	} | null;
};

export const makeDesignStudioInteraction = (input: {
	readonly refresh: () => void;
	readonly refreshPreview: () => void;
}): Effect.Effect<DesignStudioInteraction, never, Scope.Scope> =>
	Effect.gen(function* () {
		let currentWorld: World | undefined;
		let currentDispatch: Dispatch | undefined;
		let activeInteraction: ActiveInteraction | undefined;
		let designStudioInteraction = initialDesignStudioInteraction;
		let popoverAnimationFrame: number | undefined;
		let popoverFading = false;
		let latestPointer: Position | undefined;
		let autoPanAnimationFrame: number | undefined;
		let previousAutoPanTime: number | undefined;

		const svgPosition = (
			clientX: number,
			clientY: number,
		): Position | undefined => {
			const canvas = document.querySelector("#world-canvas");
			if (!(canvas instanceof SVGSVGElement)) return undefined;
			const matrix = canvas.getScreenCTM();
			if (matrix === null) return undefined;
			const point = canvas.createSVGPoint();
			point.x = clientX;
			point.y = clientY;
			const transformed = point.matrixTransform(matrix.inverse());
			return { x: transformed.x, y: transformed.y };
		};

		const projectedPointerPosition = (
			event: PointerEvent | DragEvent,
			camera: Position,
		): Position | undefined => {
			const pointer = svgPosition(event.clientX, event.clientY);
			return pointer === undefined
				? undefined
				: { x: pointer.x - camera.x, y: pointer.y - camera.y };
		};

		const pointerWorldPosition = (
			event: PointerEvent | DragEvent,
			camera: Position,
		): Position | undefined => {
			const pointer = projectedPointerPosition(event, camera);
			return pointer === undefined ? undefined : unproject(pointer);
		};

		const startPan = (event: PointerEvent, world: World): void => {
			if (event.button !== 0 && event.button !== 1) return;
			const pointer = svgPosition(event.clientX, event.clientY);
			if (pointer === undefined) return;
			event.preventDefault();
			activeInteraction = {
				kind: "pan",
				pointer,
				camera: world.editor.camera,
			};
		};

		const isPanGesture = (event: PointerEvent): boolean =>
			event.button === 1 || event.metaKey || event.ctrlKey;

		const startEntityMove = (
			event: PointerEvent,
			world: World,
			entity: EntityId,
			dispatch: Dispatch,
		): void => {
			if (!world.editor.open) return;
			if (world.editor.editSession !== null || activeInteraction !== undefined)
				return;
			event.stopPropagation();
			if (isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const projectedPointer = projectedPointerPosition(
				event,
				world.editor.camera,
			);
			const position = world.positions.get(entity);
			const body = world.bodies.get(entity);
			if (
				projectedPointer === undefined ||
				position === undefined ||
				body === undefined
			)
				return;
			event.preventDefault();
			latestPointer = { x: event.clientX, y: event.clientY };
			dispatch(Action.EditorSelectionChanged({ selection: entity }));
			const pointerAtBase = unproject(
				projectedPointer,
				entityBaseElevation(world, entity),
			);
			activeInteraction = {
				kind: "move",
				entity,
				grabOffset: {
					x: pointerAtBase.x - position.x,
					y: pointerAtBase.y - position.y,
				},
				position,
				body,
			};
			dispatch(
				Action.EditorEditSessionBegan({
					operation: {
						kind: "move",
						entity,
						originalPosition: position,
						originalBody: body,
						position,
					},
				}),
			);
		};

		const startEntityResize = (
			event: PointerEvent,
			world: World,
			entity: EntityId,
			widthDirection: ResizeDirection,
			depthDirection: ResizeDirection,
			dispatch: Dispatch,
		): void => {
			if (world.editor.editSession !== null || activeInteraction !== undefined)
				return;
			event.stopPropagation();
			if (isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const pointer = pointerWorldPosition(event, world.editor.camera);
			const position = world.positions.get(entity);
			const body = world.bodies.get(entity);
			if (pointer === undefined || position === undefined || body === undefined)
				return;
			event.preventDefault();
			latestPointer = { x: event.clientX, y: event.clientY };
			activeInteraction = {
				kind: "resize",
				entity,
				pointer,
				position,
				body,
				widthDirection,
				depthDirection,
			};
			dispatch(
				Action.EditorEditSessionBegan({
					operation: {
						kind: "resize",
						entity,
						originalPosition: position,
						originalBody: body,
						position,
						body,
					},
				}),
			);
		};

		const startFloorResize = (
			event: PointerEvent,
			world: World,
			widthDirection: ResizeDirection,
			depthDirection: ResizeDirection,
			dispatch: Dispatch,
		): void => {
			if (world.editor.editSession !== null || activeInteraction !== undefined)
				return;
			event.stopPropagation();
			if (isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const pointer = projectedPointerPosition(event, world.editor.camera);
			if (pointer === undefined) return;
			event.preventDefault();
			latestPointer = { x: event.clientX, y: event.clientY };
			activeInteraction = {
				kind: "resize-floor",
				pointer,
				floorPlan: world.floorPlan,
				widthDirection,
				depthDirection,
				originalFloorOrigin: world.floorOrigin,
			};
			dispatch(
				Action.EditorEditSessionBegan({
					operation: {
						kind: "resize-floor",
						floorPlan: world.floorPlan,
						floorOrigin: world.floorOrigin,
					},
				}),
			);
		};

		const startPaletteDrag = (
			event: PointerEvent,
			itemKind: EditorItemKind,
			world: World,
		): void => {
			if (event.button !== 0) return;
			if (world.editor.editSession !== null || activeInteraction !== undefined)
				return;
			event.preventDefault();
			const target = event.currentTarget;
			if (!(target instanceof HTMLElement)) return;
			const bounds = target.getBoundingClientRect();
			designStudioInteraction = pressPaletteItem(designStudioInteraction, {
				itemKind,
				pointer: { x: event.clientX, y: event.clientY },
				itemBounds: {
					left: bounds.left,
					top: bounds.top,
					right: bounds.right,
					bottom: bounds.bottom,
				},
			});
			popoverFading = false;
			input.refresh();
		};

		const onPointerMove = (event: PointerEvent): void => {
			latestPointer = { x: event.clientX, y: event.clientY };
			const world = currentWorld;
			const dispatch = currentDispatch;
			const paletteMove = movePalettePress(designStudioInteraction, {
				x: event.clientX,
				y: event.clientY,
			});
			designStudioInteraction = paletteMove.state;
			if (
				paletteMove.activated !== null &&
				world?.editor.open === true &&
				world.editor.editSession === null &&
				activeInteraction === undefined &&
				dispatch !== undefined
			) {
				const projectedPointer = projectedPointerPosition(
					event,
					world.editor.camera,
				);
				if (projectedPointer === undefined) return;
				const body = defaultEditorItemBody(paletteMove.activated.itemKind);
				const position = editorPlacementPositionAtPointer({
					world,
					kind: paletteMove.activated.itemKind,
					body,
					projectedPointer,
				});
				const target = document.elementFromPoint(event.clientX, event.clientY);
				activeInteraction = {
					kind: "create",
					itemKind: paletteMove.activated.itemKind,
					pointer: paletteMove.activated.pointer,
					position,
					canDrop:
						target instanceof Element &&
						target.closest("#world-canvas") !== null,
				};
				previousAutoPanTime = undefined;
				dispatch(
					Action.EditorEditSessionBegan({
						operation: {
							kind: "create",
							itemKind: paletteMove.activated.itemKind,
							position,
						},
					}),
				);
				return;
			}
			const interaction = activeInteraction;
			if (
				interaction === undefined ||
				world === undefined ||
				dispatch === undefined
			)
				return;

			if (interaction.kind === "pan") {
				const pointer = svgPosition(event.clientX, event.clientY);
				if (pointer === undefined) return;
				dispatch(
					Action.EditorCameraChanged({
						camera: {
							x: interaction.camera.x + pointer.x - interaction.pointer.x,
							y: interaction.camera.y + pointer.y - interaction.pointer.y,
						},
					}),
				);
				return;
			}
			if (interaction.kind === "create") {
				const projectedPointer = projectedPointerPosition(
					event,
					world.editor.camera,
				);
				if (projectedPointer === undefined) return;
				const body = defaultEditorItemBody(interaction.itemKind);
				const position = editorPlacementPositionAtPointer({
					world,
					kind: interaction.itemKind,
					body,
					projectedPointer,
				});
				const target = document.elementFromPoint(event.clientX, event.clientY);
				activeInteraction = {
					...interaction,
					position,
					canDrop:
						target instanceof Element &&
						target.closest("#world-canvas") !== null,
				};
				dispatch(
					Action.EditorEditSessionPreviewed({
						preview: { kind: "create", position },
					}),
				);
				return;
			}

			if (interaction.kind === "resize-floor") {
				const pointer = svgPosition(event.clientX, event.clientY);
				if (pointer === undefined) return;
				const resized = resizeFromHandle({
					position: {
						x:
							interaction.originalFloorOrigin.x +
							interaction.floorPlan.width / 2,
						y:
							interaction.originalFloorOrigin.y +
							interaction.floorPlan.depth / 2,
					},
					body: interaction.floorPlan,
					delta: floorResizePointerDelta({
						startPointer: interaction.pointer,
						screenPointer: pointer,
						camera: world.editor.camera,
					}),
					widthDirection: interaction.widthDirection,
					depthDirection: interaction.depthDirection,
					minimumBody: minimumFloorBody,
					maximumBody: maximumFloorBody,
				});
				const floorOrigin = {
					x: resized.position.x - resized.body.width / 2,
					y: resized.position.y - resized.body.depth / 2,
				};
				dispatch(
					Action.EditorEditSessionPreviewed({
						preview: {
							kind: "resize-floor",
							floorPlan: resized.body,
							floorOrigin,
						},
					}),
				);
				return;
			}

			if (interaction.kind === "move") {
				const projectedPointer = projectedPointerPosition(
					event,
					world.editor.camera,
				);
				const itemKind = editorItemKindForEntity({
					world,
					entity: interaction.entity,
				});
				if (projectedPointer === undefined || itemKind === undefined) return;
				const position = editorPlacementPositionAtPointer({
					world,
					kind: itemKind,
					body: interaction.body,
					projectedPointer,
					grabOffset: interaction.grabOffset,
					excludedEntity: interaction.entity,
				});
				dispatch(
					Action.EditorEditSessionPreviewed({
						preview: { kind: "move", position },
					}),
				);
			} else if (interaction.kind === "resize") {
				const pointer = pointerWorldPosition(event, world.editor.camera);
				if (pointer === undefined) return;
				const resized = resizeFromHandle({
					position: interaction.position,
					body: interaction.body,
					delta: {
						x: pointer.x - interaction.pointer.x,
						y: pointer.y - interaction.pointer.y,
					},
					widthDirection: interaction.widthDirection,
					depthDirection: interaction.depthDirection,
					minimumBody: minimumEntityBody,
					maximumBody: maximumEditorBody({ world, entity: interaction.entity }),
				});
				dispatch(
					Action.EditorEditSessionPreviewed({
						preview: {
							kind: "resize",
							body: resized.body,
							position: resized.position,
						},
					}),
				);
			}
		};

		const onPointerUp = (_event: PointerEvent): void => {
			const interaction = activeInteraction;
			const world = currentWorld;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			latestPointer = undefined;
			previousAutoPanTime = undefined;
			input.refreshPreview();
			const releasedPaletteState = releasePalettePress(
				designStudioInteraction,
				performance.now(),
			);
			if (releasedPaletteState !== designStudioInteraction) {
				designStudioInteraction = releasedPaletteState;
				popoverFading = false;
				if (popoverAnimationFrame !== undefined)
					cancelAnimationFrame(popoverAnimationFrame);
				const animatePopover = (time: number): void => {
					const visible = visiblePalettePopover(designStudioInteraction, time);
					if (visible === null) {
						designStudioInteraction = dismissPalettePopover(
							designStudioInteraction,
						);
						popoverFading = false;
						popoverAnimationFrame = undefined;
						input.refresh();
						return;
					}
					const fading = visible.opacity < 1;
					if (fading !== popoverFading) {
						popoverFading = fading;
						input.refresh();
					}
					popoverAnimationFrame = requestAnimationFrame(animatePopover);
				};
				popoverAnimationFrame = requestAnimationFrame(animatePopover);
				input.refresh();
				return;
			}
			if (
				interaction?.kind === "create" &&
				world?.editor.open === true &&
				dispatch !== undefined
			) {
				dispatch(
					interaction.canDrop
						? Action.EditorEditSessionCommitted()
						: Action.EditorEditSessionCancelled(),
				);
			}
			if (
				(interaction?.kind === "move" || interaction?.kind === "resize") &&
				dispatch !== undefined
			) {
				dispatch(Action.EditorEditSessionCommitted());
			} else if (
				interaction?.kind === "resize-floor" &&
				dispatch !== undefined
			) {
				dispatch(Action.EditorEditSessionCommitted());
			}
		};
		const onPointerCancel = (): void => {
			const interaction = activeInteraction;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			latestPointer = undefined;
			previousAutoPanTime = undefined;
			input.refreshPreview();
			if (interaction !== undefined && interaction.kind !== "pan")
				dispatch?.(Action.EditorEditSessionCancelled());
		};
		const onWheel = (event: WheelEvent): void => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			if (world?.editor.open !== true || dispatch === undefined) return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest("[data-editor-panel]") !== null
			)
				return;
			event.preventDefault();
			const canvas = document.querySelector("#world-canvas");
			if (!(canvas instanceof SVGSVGElement)) return;
			const matrix = canvas.getScreenCTM();
			if (matrix === null) return;
			let deltaFactor = 1;
			if (event.deltaMode === 1) deltaFactor = wheelLinePixels;
			else if (event.deltaMode === 2) deltaFactor = window.innerHeight;
			const scaleX = Math.max(Number.EPSILON, Math.abs(matrix.a));
			const scaleY = Math.max(Number.EPSILON, Math.abs(matrix.d));
			dispatch(
				Action.EditorCameraChanged({
					camera: {
						x: world.editor.camera.x - (event.deltaX * deltaFactor) / scaleX,
						y: world.editor.camera.y - (event.deltaY * deltaFactor) / scaleY,
					},
				}),
			);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			if (world?.editor.open !== true || dispatch === undefined) return;
			if (
				world.editor.invalidPlacement !== null ||
				(world.editor.editSession?.phase === "invalid-released" &&
					world.editor.editSession.validity.kind === "invalid")
			) {
				if (event.key === "Enter" || event.key === "Escape") {
					event.preventDefault();
					dispatch(
						world.editor.editSession === null
							? Action.EditorInvalidPlacementDismissed()
							: Action.EditorEditSessionCancelled(),
					);
				}
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement
			)
				return;
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				dispatch(Action.EditorDeleteSelected());
			} else if (event.key === "Escape") {
				event.preventDefault();
				if (designStudioInteraction.popover !== null) {
					designStudioInteraction = dismissPalettePopover(
						designStudioInteraction,
					);
					popoverFading = false;
					input.refresh();
				} else dispatch(Action.EditorToggled());
			}
		};

		const autoPanFrame = (time: number): void => {
			const interaction = activeInteraction;
			const world = currentWorld;
			const dispatch = currentDispatch;
			const clientPointer = latestPointer;
			if (
				interaction !== undefined &&
				interaction.kind !== "pan" &&
				world !== undefined &&
				world.editor.editSession !== null &&
				dispatch !== undefined &&
				clientPointer !== undefined
			) {
				const pointer = svgPosition(clientPointer.x, clientPointer.y);
				const canvas = document.querySelector("#world-canvas");
				const matrix =
					canvas instanceof SVGSVGElement ? canvas.getScreenCTM() : null;
				if (
					pointer !== undefined &&
					canvas instanceof SVGSVGElement &&
					matrix !== null
				) {
					const canvasBounds = canvas.getBoundingClientRect();
					const elapsedSeconds =
						previousAutoPanTime === undefined
							? 0
							: (time - previousAutoPanTime) / 1_000;
					previousAutoPanTime = time;
					const operation = world.editor.editSession.operation;
					const previewWorld =
						operation.kind === "resize" || operation.kind === "resize-floor"
							? editSessionView(world)
							: world;
					const nextCamera = autoPanCamera({
						camera: world.editor.camera,
						pointer: {
							x: clientPointer.x - canvasBounds.left,
							y: clientPointer.y - canvasBounds.top,
						},
						viewport: {
							width: canvasBounds.width,
							height: canvasBounds.height,
						},
						scale: { x: matrix.a, y: matrix.d },
						envelope:
							previewWorld === world
								? contentEnvelope(world)
								: contentEnvelopeIncludingPreview({
										world,
										previewWorld,
									}),
						elapsedSeconds,
					});
					if (
						nextCamera.x !== world.editor.camera.x ||
						nextCamera.y !== world.editor.camera.y
					) {
						const projectedPointer = {
							x: pointer.x - nextCamera.x,
							y: pointer.y - nextCamera.y,
						};
						if (interaction.kind === "create") {
							const body = defaultEditorItemBody(interaction.itemKind);
							const position = editorPlacementPositionAtPointer({
								world,
								kind: interaction.itemKind,
								body,
								projectedPointer,
							});
							activeInteraction = { ...interaction, position };
							dispatch(
								Action.EditorEditSessionAutoPanned({
									camera: nextCamera,
									preview: { kind: "create", position },
								}),
							);
						} else if (interaction.kind === "move") {
							const itemKind = editorItemKindForEntity({
								world,
								entity: interaction.entity,
							});
							if (itemKind !== undefined) {
								const position = editorPlacementPositionAtPointer({
									world,
									kind: itemKind,
									body: interaction.body,
									projectedPointer,
									grabOffset: interaction.grabOffset,
									excludedEntity: interaction.entity,
								});
								dispatch(
									Action.EditorEditSessionAutoPanned({
										camera: nextCamera,
										preview: { kind: "move", position },
									}),
								);
							}
						} else if (interaction.kind === "resize") {
							const pointerWorld = unproject(projectedPointer);
							const resized = resizeFromHandle({
								position: interaction.position,
								body: interaction.body,
								delta: {
									x: pointerWorld.x - interaction.pointer.x,
									y: pointerWorld.y - interaction.pointer.y,
								},
								widthDirection: interaction.widthDirection,
								depthDirection: interaction.depthDirection,
								minimumBody: minimumEntityBody,
								maximumBody: maximumEditorBody({
									world,
									entity: interaction.entity,
								}),
							});
							dispatch(
								Action.EditorEditSessionAutoPanned({
									camera: nextCamera,
									preview: {
										kind: "resize",
										position: resized.position,
										body: resized.body,
									},
								}),
							);
						} else {
							const resized = resizeFromHandle({
								position: {
									x:
										interaction.originalFloorOrigin.x +
										interaction.floorPlan.width / 2,
									y:
										interaction.originalFloorOrigin.y +
										interaction.floorPlan.depth / 2,
								},
								body: interaction.floorPlan,
								delta: floorResizePointerDelta({
									startPointer: interaction.pointer,
									screenPointer: pointer,
									camera: nextCamera,
								}),
								widthDirection: interaction.widthDirection,
								depthDirection: interaction.depthDirection,
								minimumBody: minimumFloorBody,
								maximumBody: maximumFloorBody,
							});
							const floorOrigin = {
								x: resized.position.x - resized.body.width / 2,
								y: resized.position.y - resized.body.depth / 2,
							};
							dispatch(
								Action.EditorEditSessionAutoPanned({
									camera: nextCamera,
									preview: {
										kind: "resize-floor",
										floorPlan: resized.body,
										floorOrigin,
									},
								}),
							);
						}
					}
				}
			} else previousAutoPanTime = undefined;
			autoPanAnimationFrame = requestAnimationFrame(autoPanFrame);
		};

		yield* Effect.acquireRelease(
			Effect.sync(() => {
				window.addEventListener("pointermove", onPointerMove);
				window.addEventListener("pointerup", onPointerUp);
				window.addEventListener("pointercancel", onPointerCancel);
				window.addEventListener("wheel", onWheel, { passive: false });
				window.addEventListener("keydown", onKeyDown);
				autoPanAnimationFrame = requestAnimationFrame(autoPanFrame);
			}),
			() =>
				Effect.sync(() => {
					window.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("pointerup", onPointerUp);
					window.removeEventListener("pointercancel", onPointerCancel);
					window.removeEventListener("wheel", onWheel);
					window.removeEventListener("keydown", onKeyDown);
					if (autoPanAnimationFrame !== undefined)
						cancelAnimationFrame(autoPanAnimationFrame);
					if (popoverAnimationFrame !== undefined)
						cancelAnimationFrame(popoverAnimationFrame);
					activeInteraction = undefined;
					designStudioInteraction = initialDesignStudioInteraction;
					currentWorld = undefined;
					currentDispatch = undefined;
				}),
		);
		return {
			startPan,
			startEntityMove,
			startEntityResize,
			startFloorResize,
			startPaletteDrag,
			update: (world, dispatch) => {
				currentWorld = world;
				currentDispatch = dispatch;
			},
			dismissPalettePopover: () => {
				const dismissed = dismissPalettePopover(designStudioInteraction);
				if (dismissed === designStudioInteraction) return;
				designStudioInteraction = dismissed;
				popoverFading = false;
				input.refresh();
			},
			isPanGesture: (event) =>
				event.button === 1 || event.metaKey || event.ctrlKey,
			isGestureActive: () =>
				activeInteraction !== undefined && activeInteraction.kind !== "pan",
			createPreview: () =>
				activeInteraction?.kind === "create" ? activeInteraction : null,
			palettePopover: () =>
				designStudioInteraction.popover === null
					? null
					: {
							left: designStudioInteraction.popover.itemBounds.left,
							top: designStudioInteraction.popover.itemBounds.top,
							fading: popoverFading,
						},
		};
	});
