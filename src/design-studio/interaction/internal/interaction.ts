import { Effect, type Scope } from "effect";
import { Action, type Action as AppAction } from "../../../app/action";
import {
	canvasCoverZoomForScreen,
	canvasViewportForScreen,
	unproject,
} from "../../../presentation/geometry/projection";
import {
	type ResizeDirection,
	resizeFromHandle,
} from "../../../presentation/geometry/resize";
import type { Body, Position } from "../../../world/components";
import type { EntityId } from "../../../world/entity-id";
import { surfaceAt } from "../../../world/spatial/collision";
import { entityBaseElevation } from "../../../world/spatial/elevation";
import {
	characterSpawnPosition,
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
import { type DesignStudioItemKind, defaultEditorItemBody } from "../../model";
import { editorPlacementPositionAtPointer } from "../placement";
import {
	autoPanCamera,
	clampCameraToEnvelope,
	contentEnvelope,
	contentEnvelopeIncludingPreview,
	dismissPalettePopover,
	floorResizePointerDelta,
	initialDesignStudioInteraction,
	movePalettePress,
	nextTouchEditorMode,
	pressPaletteItem,
	releasePalettePress,
	shouldPanTouchGesture,
	shouldStartPinchGesture,
	type TouchEditorMode,
	touchEntityPointerIntent,
	touchJoystickTarget,
	visiblePalettePopover,
} from "../pointer";

type Dispatch = (action: AppAction) => void;

type ActiveInteraction =
	| {
			readonly kind: "pan";
			readonly pointer: Position;
			readonly camera: Position;
			readonly touchClientPointer?: Position;
			readonly touchStartedAt?: number;
			readonly touchSelectionCandidate?: EntityId;
	  }
	| {
			readonly kind: "move";
			readonly entity: EntityId;
			readonly grabOffset: Position;
			readonly position: Position;
			readonly body: Body;
			readonly touchControl?: "joystick" | "pointer";
			readonly touchPointerId?: number;
	  }
	| {
			readonly kind: "resize";
			readonly entity: EntityId;
			readonly pointer: Position;
			readonly position: Position;
			readonly body: Body;
			readonly widthDirection: ResizeDirection;
			readonly depthDirection: ResizeDirection;
			readonly touchPointerId?: number;
	  }
	| {
			readonly kind: "create";
			readonly itemKind: DesignStudioItemKind;
			readonly pointer: Position;
			readonly position: Position;
			readonly canDrop: boolean;
			readonly touchControlled?: boolean;
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
const touchItemSpeed = 180;
const touchCameraSpeed = 480;
const maximumTouchFrameElapsedSeconds = 0.05;
const minimumEditorZoom = 0.65;
const maximumEditorZoom = 6;
const usesTouchControls = (): boolean =>
	window.matchMedia("(any-pointer: coarse)").matches;

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
		itemKind: DesignStudioItemKind,
		world: World,
	) => void;
	readonly startTouchPalettePlacement: (
		itemKind: DesignStudioItemKind,
		world: World,
		dispatch: Dispatch,
	) => void;
	readonly selectTouchEntity: (
		world: World,
		entity: EntityId,
		dispatch: Dispatch,
	) => void;
	readonly updateTouchJoystick: (input: {
		readonly pointerId: number;
		readonly vector: Position | null;
	}) => void;
	readonly finishTouchInteraction: () => void;
	readonly touchEditorMode: () => TouchEditorMode;
	readonly toggleTouchEditorMode: () => void;
	readonly consumeTouchGestureClick: () => boolean;
	readonly toggleTouchPanel: () => void;
	readonly isTouchPanelOpen: () => boolean;
	readonly openTouchDetails: () => void;
	readonly closeTouchDetails: () => void;
	readonly isTouchDetailsOpen: () => boolean;
	readonly usesTouchControls: () => boolean;
	readonly zoom: () => number;
	readonly zoomAt: (event: MouseEvent) => void;
	readonly update: (world: World, dispatch: Dispatch) => void;
	readonly dismissPalettePopover: () => void;
	readonly isPanGesture: (event: PointerEvent) => boolean;
	readonly isGestureActive: () => boolean;
	readonly createPreview: () => {
		readonly itemKind: DesignStudioItemKind;
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
		let touchPanelOpen = true;
		let touchDetailsOpen = false;
		let editorTouchMode: TouchEditorMode = "move";
		let touchJoystick: Position = { x: 0, y: 0 };
		let touchJoystickPointer: number | undefined;
		let previousTouchJoystickTime: number | undefined;
		let editorZoom = 1;
		const touchPointers = new Map<number, Position>();
		let suppressTouchGestureClick = false;
		let pinchGesture:
			| {
					readonly distance: number;
					readonly zoom: number;
					readonly midpoint: Position;
					readonly camera: Position;
			  }
			| undefined;
		const clearTouchJoystick = (): void => {
			touchJoystick = { x: 0, y: 0 };
			touchJoystickPointer = undefined;
			previousTouchJoystickTime = undefined;
		};
		const releaseTouchJoystickPointer = (pointerId: number): void => {
			if (touchJoystickPointer === pointerId) clearTouchJoystick();
		};
		const firstTwoTouchPointers = ():
			| readonly [Position, Position]
			| undefined => {
			const pointers = touchPointers.values();
			const first = pointers.next();
			const second = pointers.next();
			return first.done === true || second.done === true
				? undefined
				: [first.value, second.value];
		};
		const trackTouchPointerDown = (
			event: PointerEvent,
			world: World,
			dispatch: Dispatch,
		): boolean => {
			if (event.pointerType !== "touch" || !world.editor.open) return false;
			if (touchPointers.size === 0) suppressTouchGestureClick = false;
			touchPointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			});
			if (!shouldStartPinchGesture({ touchCount: touchPointers.size }))
				return false;
			const pinchPointers = firstTwoTouchPointers();
			if (pinchPointers === undefined) return false;
			const [first, second] = pinchPointers;
			const interaction = activeInteraction;
			pinchGesture = {
				distance: Math.max(
					1,
					Math.hypot(second.x - first.x, second.y - first.y),
				),
				zoom: editorZoom,
				midpoint: {
					x: (first.x + second.x) / 2,
					y: (first.y + second.y) / 2,
				},
				camera:
					interaction?.kind === "pan"
						? interaction.camera
						: world.editor.camera,
			};
			suppressTouchGestureClick = true;
			activeInteraction = undefined;
			latestPointer = undefined;
			previousAutoPanTime = undefined;
			if (
				world.editor.editSession !== null ||
				(interaction !== undefined && interaction.kind !== "pan")
			)
				dispatch(Action.EditorEditSessionCancelled());
			event.preventDefault();
			return true;
		};

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

		const canvasViewport = (zoom = editorZoom) => {
			const canvas = document.querySelector("#world-canvas");
			if (!(canvas instanceof SVGSVGElement)) return undefined;
			const bounds = canvas.getBoundingClientRect();
			return canvasViewportForScreen({
				screen: { width: bounds.width, height: bounds.height },
				zoom,
			});
		};

		const clampedCamera = (world: World, camera: Position): Position => {
			const visible = canvasViewport();
			return visible === undefined
				? camera
				: clampCameraToEnvelope({
						camera,
						viewport: visible,
						envelope: contentEnvelope(world),
					});
		};

		const cameraForZoomAt = ({
			world,
			initialClient,
			nextClient,
			initialCamera,
			initialZoom,
			nextZoom,
		}: {
			readonly world: World;
			readonly initialClient: Position;
			readonly nextClient: Position;
			readonly initialCamera: Position;
			readonly initialZoom: number;
			readonly nextZoom: number;
		}): Position => {
			const canvas = document.querySelector("#world-canvas");
			if (!(canvas instanceof SVGSVGElement)) return initialCamera;
			const bounds = canvas.getBoundingClientRect();
			const screen = { width: bounds.width, height: bounds.height };
			const initialViewport = canvasViewportForScreen({
				screen,
				zoom: initialZoom,
			});
			const nextViewport = canvasViewportForScreen({ screen, zoom: nextZoom });
			const initialHorizontal =
				(initialClient.x - bounds.left) / Math.max(1, bounds.width);
			const initialVertical =
				(initialClient.y - bounds.top) / Math.max(1, bounds.height);
			const nextHorizontal =
				(nextClient.x - bounds.left) / Math.max(1, bounds.width);
			const nextVertical =
				(nextClient.y - bounds.top) / Math.max(1, bounds.height);
			const initialPoint = {
				x: initialViewport.left + initialViewport.width * initialHorizontal,
				y: initialViewport.top + initialViewport.height * initialVertical,
			};
			const nextPoint = {
				x: nextViewport.left + nextViewport.width * nextHorizontal,
				y: nextViewport.top + nextViewport.height * nextVertical,
			};
			return clampCameraToEnvelope({
				camera: {
					x: initialCamera.x + nextPoint.x - initialPoint.x,
					y: initialCamera.y + nextPoint.y - initialPoint.y,
				},
				viewport: nextViewport,
				envelope: contentEnvelope(world),
			});
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

		const startPan = (
			event: PointerEvent,
			world: World,
			touchSelectionCandidate?: EntityId,
		): void => {
			if (event.button !== 0 && event.button !== 1) return;
			const dispatch = currentDispatch;
			if (
				dispatch !== undefined &&
				trackTouchPointerDown(event, world, dispatch)
			)
				return;
			const pointer = svgPosition(event.clientX, event.clientY);
			if (pointer === undefined) return;
			event.preventDefault();
			activeInteraction = {
				kind: "pan",
				pointer,
				camera: world.editor.camera,
				touchClientPointer:
					event.pointerType === "touch"
						? { x: event.clientX, y: event.clientY }
						: undefined,
				touchStartedAt:
					event.pointerType === "touch" ? event.timeStamp : undefined,
				...(event.pointerType === "touch" &&
				touchSelectionCandidate !== undefined
					? { touchSelectionCandidate }
					: {}),
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
			if (trackTouchPointerDown(event, world, dispatch)) {
				event.stopPropagation();
				return;
			}
			if (
				usesTouchControls() &&
				touchEntityPointerIntent({
					selection: world.editor.selected,
					entity,
				}) === "pan-canvas"
			) {
				event.stopPropagation();
				startPan(event, world, entity);
				return;
			}
			const session = world.editor.editSession;
			let continuingTouchMove = false;
			let position: Position | undefined;
			if (
				event.pointerType === "touch" &&
				session?.operation.kind === "move" &&
				session.operation.entity === entity
			) {
				continuingTouchMove = true;
				position = session.operation.position;
			} else if (world.characters.has(entity)) {
				position = characterSpawnPosition({ world, entity });
			} else {
				position = world.positions.get(entity);
			}
			if (
				!continuingTouchMove &&
				(session !== null || activeInteraction !== undefined)
			) {
				event.stopPropagation();
				return;
			}
			event.stopPropagation();
			if (event.pointerType !== "touch" && isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const projectedPointer = projectedPointerPosition(
				event,
				world.editor.camera,
			);
			const body = world.bodies.get(entity);
			if (
				projectedPointer === undefined ||
				position === undefined ||
				body === undefined
			)
				return;
			event.preventDefault();
			clearTouchJoystick();
			latestPointer = { x: event.clientX, y: event.clientY };
			const previewWorld = continuingTouchMove ? editSessionView(world) : world;
			const pointerAtBase = unproject(
				projectedPointer,
				previewWorld.characters.has(entity)
					? surfaceAt(previewWorld, position, body)
					: entityBaseElevation(previewWorld, entity),
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
				...(event.pointerType === "touch"
					? {
							touchControl: "pointer" as const,
							touchPointerId: event.pointerId,
						}
					: {}),
			};
			if (continuingTouchMove) return;
			dispatch(Action.EditorSelectionChanged({ selection: entity }));
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
			if (event.pointerType === "touch" && editorTouchMode === "move") {
				startEntityMove(event, world, entity, dispatch);
				return;
			}
			if (trackTouchPointerDown(event, world, dispatch)) {
				event.stopPropagation();
				return;
			}
			const session = world.editor.editSession;
			const continuingTouchResize =
				event.pointerType === "touch" &&
				session?.operation.kind === "resize" &&
				session.operation.entity === entity;
			event.stopPropagation();
			if (
				(!continuingTouchResize && session !== null) ||
				activeInteraction !== undefined
			)
				return;
			if (event.pointerType !== "touch" && isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const pointer = pointerWorldPosition(event, world.editor.camera);
			let position = world.positions.get(entity);
			let body = world.bodies.get(entity);
			if (continuingTouchResize) {
				position = session.operation.position;
				body = session.operation.body;
			}
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
				...(event.pointerType === "touch"
					? { touchPointerId: event.pointerId }
					: {}),
			};
			if (continuingTouchResize) return;
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
			if (event.pointerType === "touch" && editorTouchMode === "move") {
				event.stopPropagation();
				startPan(event, world);
				return;
			}
			if (trackTouchPointerDown(event, world, dispatch)) {
				event.stopPropagation();
				return;
			}
			if (world.editor.editSession !== null || activeInteraction !== undefined)
				return;
			event.stopPropagation();
			if (event.pointerType !== "touch" && isPanGesture(event)) {
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
			itemKind: DesignStudioItemKind,
			world: World,
		): void => {
			if (usesTouchControls()) return;
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

		const startTouchPalettePlacement = (
			itemKind: DesignStudioItemKind,
			world: World,
			dispatch: Dispatch,
		): void => {
			if (
				!usesTouchControls() ||
				!world.editor.open ||
				world.editor.editSession !== null ||
				activeInteraction !== undefined
			)
				return;
			const canvas = document.querySelector("#world-canvas");
			if (!(canvas instanceof SVGSVGElement)) return;
			const bounds = canvas.getBoundingClientRect();
			const pointer = svgPosition(
				bounds.left + bounds.width / 2,
				bounds.top + bounds.height / 2,
			);
			if (pointer === undefined) return;
			const projectedPointer = {
				x: pointer.x - world.editor.camera.x,
				y: pointer.y - world.editor.camera.y,
			};
			const body = defaultEditorItemBody(itemKind);
			const position = editorPlacementPositionAtPointer({
				world,
				kind: itemKind,
				body,
				projectedPointer,
			});
			activeInteraction = {
				kind: "create",
				itemKind,
				pointer: position,
				position,
				canDrop: true,
				touchControlled: true,
			};
			touchPanelOpen = false;
			dispatch(
				Action.EditorEditSessionBegan({
					operation: { kind: "create", itemKind, position },
				}),
			);
			input.refresh();
		};

		const startTouchEntityMove = (
			world: World,
			entity: EntityId,
			dispatch: Dispatch,
		): void => {
			if (
				!usesTouchControls() ||
				!world.editor.open ||
				world.editor.editSession !== null ||
				activeInteraction !== undefined
			)
				return;
			const position = world.characters.has(entity)
				? characterSpawnPosition({ world, entity })
				: world.positions.get(entity);
			const body = world.bodies.get(entity);
			if (position === undefined || body === undefined) return;
			activeInteraction = {
				kind: "move",
				entity,
				grabOffset: { x: 0, y: 0 },
				position,
				body,
				touchControl: "joystick",
			};
			touchPanelOpen = false;
			touchDetailsOpen = false;
			dispatch(Action.EditorSelectionChanged({ selection: entity }));
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
			input.refresh();
		};

		const selectTouchEntity = (
			world: World,
			entity: EntityId,
			dispatch: Dispatch,
		): void => {
			if (!usesTouchControls() || !world.editor.open) return;
			if (currentWorld?.editor.selected !== entity && !commitPendingTouchEdit())
				return;
			if (world.characters.has(entity)) editorTouchMode = "move";
			touchPanelOpen = false;
			touchDetailsOpen = false;
			dispatch(Action.EditorSelectionChanged({ selection: entity }));
			input.refresh();
		};

		const onPointerMove = (event: PointerEvent): void => {
			if (touchPointers.has(event.pointerId))
				touchPointers.set(event.pointerId, {
					x: event.clientX,
					y: event.clientY,
				});
			if (
				pinchGesture !== undefined &&
				touchPointers.size >= 2 &&
				currentWorld?.editor.open === true &&
				currentDispatch !== undefined
			) {
				const pinchPointers = firstTwoTouchPointers();
				if (pinchPointers === undefined) return;
				const [first, second] = pinchPointers;
				const distance = Math.max(
					1,
					Math.hypot(second.x - first.x, second.y - first.y),
				);
				const nextZoom = Math.min(
					maximumEditorZoom,
					Math.max(
						minimumEditorZoom,
						pinchGesture.zoom * (distance / pinchGesture.distance),
					),
				);
				const midpoint = {
					x: (first.x + second.x) / 2,
					y: (first.y + second.y) / 2,
				};
				const camera = cameraForZoomAt({
					world: currentWorld,
					initialClient: pinchGesture.midpoint,
					nextClient: midpoint,
					initialCamera: pinchGesture.camera,
					initialZoom: pinchGesture.zoom,
					nextZoom,
				});
				editorZoom = nextZoom;
				currentDispatch(Action.EditorCameraChanged({ camera }));
				input.refresh();
				return;
			}
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
			if (
				(interaction.kind === "create" &&
					interaction.touchControlled === true) ||
				(interaction.kind === "move" && interaction.touchControl === "joystick")
			)
				return;
			if (
				(interaction.kind === "move" &&
					interaction.touchControl === "pointer" &&
					interaction.touchPointerId !== event.pointerId) ||
				(interaction.kind === "resize" &&
					interaction.touchPointerId !== undefined &&
					interaction.touchPointerId !== event.pointerId)
			)
				return;

			if (interaction.kind === "pan") {
				if (
					event.pointerType === "touch" &&
					interaction.touchClientPointer !== undefined &&
					interaction.touchStartedAt !== undefined &&
					!shouldPanTouchGesture({
						elapsedMilliseconds: event.timeStamp - interaction.touchStartedAt,
						distance: Math.hypot(
							event.clientX - interaction.touchClientPointer.x,
							event.clientY - interaction.touchClientPointer.y,
						),
						selectionCandidate:
							interaction.touchSelectionCandidate !== undefined,
					})
				)
					return;
				const pointer = svgPosition(event.clientX, event.clientY);
				if (pointer === undefined) return;
				if (event.pointerType === "touch") suppressTouchGestureClick = true;
				dispatch(
					Action.EditorCameraChanged({
						camera: clampedCamera(world, {
							x: interaction.camera.x + pointer.x - interaction.pointer.x,
							y: interaction.camera.y + pointer.y - interaction.pointer.y,
						}),
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

		const onPointerUp = (event: PointerEvent): void => {
			releaseTouchJoystickPointer(event.pointerId);
			touchPointers.delete(event.pointerId);
			if (pinchGesture !== undefined) {
				if (touchPointers.size < 2) pinchGesture = undefined;
				activeInteraction = undefined;
				latestPointer = undefined;
				return;
			}
			const interaction = activeInteraction;
			if (
				interaction?.kind === "create" &&
				interaction.touchControlled === true
			)
				return;
			if (
				interaction?.kind === "move" &&
				interaction.touchControl === "joystick"
			)
				return;
			if (
				(interaction?.kind === "move" &&
					interaction.touchControl === "pointer") ||
				(interaction?.kind === "resize" &&
					interaction.touchPointerId !== undefined)
			) {
				if (interaction.touchPointerId !== event.pointerId) return;
				activeInteraction = undefined;
				latestPointer = undefined;
				previousAutoPanTime = undefined;
				input.refreshPreview();
				return;
			}
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
		const onPointerCancel = (event: PointerEvent): void => {
			releaseTouchJoystickPointer(event.pointerId);
			touchPointers.delete(event.pointerId);
			pinchGesture = undefined;
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
					camera: clampedCamera(world, {
						x: world.editor.camera.x - (event.deltaX * deltaFactor) / scaleX,
						y: world.editor.camera.y - (event.deltaY * deltaFactor) / scaleY,
					}),
				}),
			);
		};
		const onResize = (): void => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			if (world?.editor.open === true && dispatch !== undefined)
				dispatch(
					Action.EditorCameraChanged({
						camera: clampedCamera(world, world.editor.camera),
					}),
				);
			input.refresh();
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

		const commitPendingTouchEdit = (): boolean => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			pinchGesture = undefined;
			latestPointer = undefined;
			previousAutoPanTime = undefined;
			clearTouchJoystick();
			suppressTouchGestureClick = false;
			touchPointers.clear();
			input.refreshPreview();
			if (world?.editor.editSession === null) return true;
			if (world === undefined || dispatch === undefined) return false;
			dispatch(Action.EditorEditSessionCommitted());
			return currentWorld?.editor.editSession === null;
		};

		const finishTouchInteraction = (): void => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			pinchGesture = undefined;
			latestPointer = undefined;
			previousAutoPanTime = undefined;
			clearTouchJoystick();
			suppressTouchGestureClick = false;
			touchPanelOpen = false;
			touchDetailsOpen = false;
			touchPointers.clear();
			if (world !== undefined && world.editor.editSession !== null)
				dispatch?.(Action.EditorEditSessionCommitted());
			dispatch?.(Action.EditorSelectionChanged({ selection: null }));
			input.refreshPreview();
			input.refresh();
		};

		const applyTouchJoystick = (time: number): void => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			const moving =
				Math.abs(touchJoystick.x) > Number.EPSILON ||
				Math.abs(touchJoystick.y) > Number.EPSILON;
			if (
				!moving ||
				world?.editor.open !== true ||
				dispatch === undefined ||
				touchPanelOpen
			) {
				previousTouchJoystickTime = undefined;
				return;
			}
			if (previousTouchJoystickTime === undefined) {
				previousTouchJoystickTime = time;
				return;
			}
			const elapsedSeconds = Math.min(
				(time - previousTouchJoystickTime) / 1_000,
				maximumTouchFrameElapsedSeconds,
			);
			previousTouchJoystickTime = time;
			const interaction = activeInteraction;
			const selected = world.editor.selected;
			if (touchJoystickTarget(selected) === "selected-entity") {
				if (selected === null || selected === "floor") return;
				const isSelectedTouchMove =
					interaction?.kind === "move" &&
					interaction.touchControl === "joystick" &&
					interaction.entity === selected;
				if (world.editor.editSession === null) {
					if (!isSelectedTouchMove) {
						activeInteraction = undefined;
						startTouchEntityMove(world, selected, dispatch);
					}
					previousTouchJoystickTime = time;
					return;
				}
				const operation = world.editor.editSession.operation;
				if (operation.kind !== "move" || operation.entity !== selected) {
					activeInteraction = undefined;
					dispatch(Action.EditorEditSessionCancelled());
					return;
				}
				if (!isSelectedTouchMove) {
					const body = world.bodies.get(selected);
					if (body === undefined) return;
					activeInteraction = {
						kind: "move",
						entity: selected,
						grabOffset: { x: 0, y: 0 },
						position: operation.position,
						body,
						touchControl: "joystick",
					};
					previousTouchJoystickTime = time;
					return;
				}
				const currentPosition = operation.position;
				const position = {
					x:
						currentPosition.x +
						touchJoystick.x * touchItemSpeed * elapsedSeconds,
					y:
						currentPosition.y +
						touchJoystick.y * touchItemSpeed * elapsedSeconds,
				};
				activeInteraction = { ...interaction, position };
				dispatch(
					Action.EditorEditSessionPreviewed({
						preview: { kind: "move", position },
					}),
				);
				return;
			}
			if (
				world.editor.editSession !== null ||
				(interaction !== undefined && interaction.kind !== "pan")
			) {
				activeInteraction = undefined;
				if (world.editor.editSession !== null)
					dispatch(Action.EditorEditSessionCancelled());
				return;
			}
			dispatch(
				Action.EditorCameraChanged({
					camera: clampedCamera(world, {
						x:
							world.editor.camera.x -
							touchJoystick.x * touchCameraSpeed * elapsedSeconds,
						y:
							world.editor.camera.y -
							touchJoystick.y * touchCameraSpeed * elapsedSeconds,
					}),
				}),
			);
		};

		const autoPanFrame = (time: number): void => {
			applyTouchJoystick(time);
			const interaction = activeInteraction;
			const world = currentWorld;
			const dispatch = currentDispatch;
			const clientPointer = latestPointer;
			if (
				interaction !== undefined &&
				interaction.kind !== "pan" &&
				!(
					(interaction.kind === "create" &&
						interaction.touchControlled === true) ||
					(interaction.kind === "move" &&
						interaction.touchControl !== undefined)
				) &&
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
				window.addEventListener("resize", onResize);
				autoPanAnimationFrame = requestAnimationFrame(autoPanFrame);
			}),
			() =>
				Effect.sync(() => {
					window.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("pointerup", onPointerUp);
					window.removeEventListener("pointercancel", onPointerCancel);
					window.removeEventListener("wheel", onWheel);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("resize", onResize);
					if (autoPanAnimationFrame !== undefined)
						cancelAnimationFrame(autoPanAnimationFrame);
					if (popoverAnimationFrame !== undefined)
						cancelAnimationFrame(popoverAnimationFrame);
					activeInteraction = undefined;
					designStudioInteraction = initialDesignStudioInteraction;
					clearTouchJoystick();
					touchPanelOpen = false;
					touchDetailsOpen = false;
					editorTouchMode = "move";
					suppressTouchGestureClick = false;
					editorZoom = 1;
					touchPointers.clear();
					pinchGesture = undefined;
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
			startTouchPalettePlacement,
			selectTouchEntity,
			updateTouchJoystick: ({ pointerId, vector }) => {
				if (vector === null) {
					releaseTouchJoystickPointer(pointerId);
					return;
				}
				if (
					touchJoystickPointer !== undefined &&
					touchJoystickPointer !== pointerId
				)
					return;
				touchJoystickPointer = pointerId;
				touchJoystick = vector;
				if (vector.x === 0 && vector.y === 0)
					previousTouchJoystickTime = undefined;
			},
			finishTouchInteraction,
			touchEditorMode: () => editorTouchMode,
			toggleTouchEditorMode: () => {
				if (currentWorld?.editor.open !== true) return;
				if (!commitPendingTouchEdit()) return;
				editorTouchMode = nextTouchEditorMode(editorTouchMode);
				input.refresh();
			},
			consumeTouchGestureClick: () => {
				if (!suppressTouchGestureClick) return false;
				suppressTouchGestureClick = false;
				return true;
			},
			toggleTouchPanel: () => {
				if (
					currentWorld === undefined ||
					currentWorld.editor.editSession !== null
				)
					return;
				touchPanelOpen = !touchPanelOpen;
				touchDetailsOpen = false;
				clearTouchJoystick();
				input.refresh();
			},
			isTouchPanelOpen: () => touchPanelOpen,
			openTouchDetails: () => {
				const world = currentWorld;
				if (world === undefined || world.editor.selected === null) return;
				if (!commitPendingTouchEdit()) return;
				touchDetailsOpen = true;
				input.refresh();
			},
			closeTouchDetails: () => {
				touchDetailsOpen = false;
				input.refresh();
			},
			isTouchDetailsOpen: () => touchDetailsOpen,
			usesTouchControls,
			zoom: () => editorZoom,
			zoomAt: (event) => {
				const world = currentWorld;
				const dispatch = currentDispatch;
				if (world?.editor.open !== true || dispatch === undefined) return;
				event.preventDefault();
				const nextZoom = Math.min(maximumEditorZoom, editorZoom * 1.5);
				const client = { x: event.clientX, y: event.clientY };
				const camera = cameraForZoomAt({
					world,
					initialClient: client,
					nextClient: client,
					initialCamera: world.editor.camera,
					initialZoom: editorZoom,
					nextZoom,
				});
				editorZoom = nextZoom;
				dispatch(Action.EditorCameraChanged({ camera }));
				input.refresh();
			},
			update: (world, dispatch) => {
				if (world.editor.selected === null) touchDetailsOpen = false;
				const selected = world.editor.selected;
				if (
					selected !== null &&
					selected !== "floor" &&
					world.characters.has(selected)
				)
					editorTouchMode = "move";
				if (world.editor.open && currentWorld?.editor.open !== true) {
					touchPanelOpen = false;
					if (usesTouchControls())
						editorZoom = Math.min(
							maximumEditorZoom,
							Math.max(
								minimumEditorZoom,
								canvasCoverZoomForScreen({
									width: window.innerWidth,
									height: window.innerHeight,
								}),
							),
						);
				} else if (!world.editor.open) {
					touchPanelOpen = false;
					touchDetailsOpen = false;
					clearTouchJoystick();
					activeInteraction = undefined;
					editorTouchMode = "move";
					suppressTouchGestureClick = false;
					editorZoom = 1;
					touchPointers.clear();
					pinchGesture = undefined;
				}
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
				event.pointerType === "touch" ||
				event.button === 1 ||
				event.metaKey ||
				event.ctrlKey,
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
