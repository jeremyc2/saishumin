import { Context, Effect, Layer } from "effect";
import { html, render, svg, type TemplateResult } from "lit-html";
import { surfaceAt } from "../ecs/collision";
import {
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	isNewEditorItemPlacementValid,
} from "../ecs/editor-placement";
import {
	editorEntityHeight,
	editorEntityHeightLimits,
	editorItemKindForEntity,
	maximumEditorBody,
} from "../ecs/editor-sizing";
import {
	entityBaseElevation,
	placementElevationForKind,
	shadowSectionsForEntity,
} from "../ecs/elevation";
import { isSupportSurfaceOccupied } from "../ecs/support-surface";
import {
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	playerBody,
	playerEntity,
	type World,
} from "../ecs/world";
import { Action } from "../model/action";
import {
	type Body,
	Decoration,
	DecorationKinds,
	defaultSignContent,
	ObstacleKinds,
	type Position,
} from "../model/component";
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
} from "../model/design-studio-interaction";
import {
	type EditSessionPresentation,
	editSessionView,
} from "../model/edit-session";
import {
	defaultEditorItemBody,
	defaultEditorItemHeight,
	type EditorItemKind,
	EditorItemKinds,
} from "../model/editor";
import type { EntityId } from "../model/entity-id";
import { editorPlacementPositionAtPointer } from "../render/editor-placement-projection";
import {
	renderDepthForEntity,
	renderDepthForPlayer,
} from "../render/entity-render-depth";
import { outdoorFloorTiles } from "../render/outdoor-floor";
import {
	points,
	project,
	projectedRectangle,
	unproject,
	viewport,
} from "../render/projection";
import { type ResizeDirection, resizeFromHandle } from "../render/resize";
import {
	boxTemplate,
	chestTemplate,
	crateTemplate,
	decorationTemplate,
	playerTemplate,
} from "../render/templates";
import { terrainFloorTemplate } from "../render/terrain-templates";

type Dispatch = (action: Action) => void;

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

const selectionHandleSize = 16;
const selectionDashPattern = "13 9";
const selectionDashPeriod = 22;
const wheelLinePixels = 16;
const floorGridSpacing = { x: 100, y: 80 } as const;
const floorGridStrokeWidth = 2;
const floorGridOpacity = 0.32;
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

const midpoint = (start: Position, end: Position): Position => ({
	x: (start.x + end.x) / 2,
	y: (start.y + end.y) / 2,
});

const interiorGridCoordinates = (
	extent: number,
	spacing: number,
): ReadonlyArray<number> =>
	Array.from(
		{ length: Math.max(0, Math.ceil(extent / spacing) - 1) },
		(_, index) => (index + 1) * spacing,
	);

const paletteItems: ReadonlyArray<{
	readonly kind: EditorItemKind;
	readonly label: string;
	readonly icon: string;
	readonly description: string;
}> = [
	{
		kind: EditorItemKinds.Rug,
		label: "Rug",
		icon: "▱",
		description: "Soft floor color",
	},
	{
		kind: EditorItemKinds.Plant,
		label: "Plant",
		icon: "♧",
		description: "Leafy decoration",
	},
	{
		kind: EditorItemKinds.Lamp,
		label: "Lamp",
		icon: "♢",
		description: "Warm floor lamp",
	},
	{
		kind: EditorItemKinds.Wall,
		label: "Wall",
		icon: "▰",
		description: "Solid boundary",
	},
	{
		kind: EditorItemKinds.Platform,
		label: "Platform",
		icon: "▥",
		description: "Raised surface",
	},
	{
		kind: EditorItemKinds.Crate,
		label: "Crate",
		icon: "□",
		description: "Pushable object",
	},
	{
		kind: EditorItemKinds.Chest,
		label: "Chest",
		icon: "▣",
		description: "Open from the front",
	},
	{
		kind: EditorItemKinds.Sign,
		label: "Sign",
		icon: "⚐",
		description: "Read from the front",
	},
];

const entityLabel = (world: World, entity: EntityId): string => {
	const obstacle = world.obstacles.get(entity);
	if (obstacle !== undefined) {
		if (obstacle.kind === ObstacleKinds.Wall) return "Wall";
		if (obstacle.kind === ObstacleKinds.Platform) return "Platform";
		if (obstacle.kind === ObstacleKinds.Chest) return "Chest";
		return "Crate";
	}
	const decoration = world.decorations.get(entity);
	if (decoration?.kind === DecorationKinds.Rug) return "Rug";
	if (decoration?.kind === DecorationKinds.Plant) return "Plant";
	if (decoration?.kind === DecorationKinds.Sign) return "Sign";
	return "Lamp";
};

export class RenderSystemService extends Context.Service<
	RenderSystemService,
	{
		readonly render: (
			authoredWorld: World,
			viewWorld: World,
			presentation: EditSessionPresentation,
			dispatch: Dispatch,
		) => void;
	}
>()("saishumin/systems/render-system-service/RenderSystemService") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			let currentWorld: World | undefined;
			let currentViewWorld: World | undefined;
			let currentPresentation: EditSessionPresentation | undefined;
			let currentDispatch: Dispatch | undefined;
			let activeInteraction: ActiveInteraction | undefined;
			let designStudioInteraction = initialDesignStudioInteraction;
			let popoverAnimationFrame: number | undefined;
			let popoverFading = false;
			let latestPointer: Position | undefined;
			let autoPanAnimationFrame: number | undefined;
			let previousAutoPanTime: number | undefined;
			let refreshCreatePreview = (): void => {};
			let refreshLocalState = (): void => {};

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
				if (
					world.editor.editSession !== null ||
					activeInteraction !== undefined
				)
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
				if (
					world.editor.editSession !== null ||
					activeInteraction !== undefined
				)
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
				if (
					pointer === undefined ||
					position === undefined ||
					body === undefined
				)
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
				if (
					world.editor.editSession !== null ||
					activeInteraction !== undefined
				)
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
				if (
					world.editor.editSession !== null ||
					activeInteraction !== undefined
				)
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
				refreshLocalState();
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
					const position = editorPlacementPositionAtPointer(
						world,
						paletteMove.activated.itemKind,
						body,
						projectedPointer,
					);
					const target = document.elementFromPoint(
						event.clientX,
						event.clientY,
					);
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
					const position = editorPlacementPositionAtPointer(
						world,
						interaction.itemKind,
						body,
						projectedPointer,
					);
					const target = document.elementFromPoint(
						event.clientX,
						event.clientY,
					);
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
					const resized = resizeFromHandle(
						{
							x:
								interaction.originalFloorOrigin.x +
								interaction.floorPlan.width / 2,
							y:
								interaction.originalFloorOrigin.y +
								interaction.floorPlan.depth / 2,
						},
						interaction.floorPlan,
						floorResizePointerDelta(
							interaction.pointer,
							pointer,
							world.editor.camera,
						),
						interaction.widthDirection,
						interaction.depthDirection,
						minimumFloorBody,
						maximumFloorBody,
					);
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
					const itemKind = editorItemKindForEntity(world, interaction.entity);
					if (projectedPointer === undefined || itemKind === undefined) return;
					const position = editorPlacementPositionAtPointer(
						world,
						itemKind,
						interaction.body,
						projectedPointer,
						interaction.grabOffset,
						interaction.entity,
					);
					dispatch(
						Action.EditorEditSessionPreviewed({
							preview: { kind: "move", position },
						}),
					);
				} else if (interaction.kind === "resize") {
					const pointer = pointerWorldPosition(event, world.editor.camera);
					if (pointer === undefined) return;
					const resized = resizeFromHandle(
						interaction.position,
						interaction.body,
						{
							x: pointer.x - interaction.pointer.x,
							y: pointer.y - interaction.pointer.y,
						},
						interaction.widthDirection,
						interaction.depthDirection,
						minimumEntityBody,
						maximumEditorBody(world, interaction.entity),
					);
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
				refreshCreatePreview();
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
						const visible = visiblePalettePopover(
							designStudioInteraction,
							time,
						);
						if (visible === null) {
							designStudioInteraction = dismissPalettePopover(
								designStudioInteraction,
							);
							popoverFading = false;
							popoverAnimationFrame = undefined;
							refreshLocalState();
							return;
						}
						const fading = visible.opacity < 1;
						if (fading !== popoverFading) {
							popoverFading = fading;
							refreshLocalState();
						}
						popoverAnimationFrame = requestAnimationFrame(animatePopover);
					};
					popoverAnimationFrame = requestAnimationFrame(animatePopover);
					refreshLocalState();
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
				refreshCreatePreview();
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
				const deltaFactor =
					event.deltaMode === 1
						? wheelLinePixels
						: event.deltaMode === 2
							? window.innerHeight
							: 1;
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
						refreshLocalState();
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
									: contentEnvelopeIncludingPreview(world, previewWorld),
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
								const position = editorPlacementPositionAtPointer(
									world,
									interaction.itemKind,
									body,
									projectedPointer,
								);
								activeInteraction = { ...interaction, position };
								dispatch(
									Action.EditorEditSessionAutoPanned({
										camera: nextCamera,
										preview: { kind: "create", position },
									}),
								);
							} else if (interaction.kind === "move") {
								const itemKind = editorItemKindForEntity(
									world,
									interaction.entity,
								);
								if (itemKind !== undefined) {
									const position = editorPlacementPositionAtPointer(
										world,
										itemKind,
										interaction.body,
										projectedPointer,
										interaction.grabOffset,
										interaction.entity,
									);
									dispatch(
										Action.EditorEditSessionAutoPanned({
											camera: nextCamera,
											preview: { kind: "move", position },
										}),
									);
								}
							} else if (interaction.kind === "resize") {
								const pointerWorld = unproject(projectedPointer);
								const resized = resizeFromHandle(
									interaction.position,
									interaction.body,
									{
										x: pointerWorld.x - interaction.pointer.x,
										y: pointerWorld.y - interaction.pointer.y,
									},
									interaction.widthDirection,
									interaction.depthDirection,
									minimumEntityBody,
									maximumEditorBody(world, interaction.entity),
								);
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
								const resized = resizeFromHandle(
									{
										x:
											interaction.originalFloorOrigin.x +
											interaction.floorPlan.width / 2,
										y:
											interaction.originalFloorOrigin.y +
											interaction.floorPlan.depth / 2,
									},
									interaction.floorPlan,
									floorResizePointerDelta(
										interaction.pointer,
										pointer,
										nextCamera,
									),
									interaction.widthDirection,
									interaction.depthDirection,
									minimumFloorBody,
									maximumFloorBody,
								);
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

			const selectionTemplate = (
				world: World,
				invalidPreview: boolean,
				dispatch: Dispatch,
			): TemplateResult => {
				const selected = world.editor.selected;
				if (selected === null) return svg``;
				const accent = invalidPreview ? "#e59a91" : "#fff0a8";
				if (selected === "floor") {
					const outline = projectedRectangle(
						{
							x: world.floorOrigin.x + world.floorPlan.width / 2,
							y: world.floorOrigin.y + world.floorPlan.depth / 2,
						},
						world.floorPlan,
					);
					const edges = [
						{
							start: outline[0],
							end: outline[1],
							widthDirection: 0,
							depthDirection: -1,
							cursor: "cursor-ns-resize",
						},
						{
							start: outline[1],
							end: outline[2],
							widthDirection: 1,
							depthDirection: 0,
							cursor: "cursor-ew-resize",
						},
						{
							start: outline[2],
							end: outline[3],
							widthDirection: 0,
							depthDirection: 1,
							cursor: "cursor-ns-resize",
						},
						{
							start: outline[3],
							end: outline[0],
							widthDirection: -1,
							depthDirection: 0,
							cursor: "cursor-ew-resize",
						},
					] as const;
					const handles = [
						{
							point: outline[0],
							widthDirection: -1,
							depthDirection: -1,
							cursor: "cursor-nwse-resize",
						},
						{
							point: midpoint(outline[0], outline[1]),
							widthDirection: 0,
							depthDirection: -1,
							cursor: "cursor-ns-resize",
						},
						{
							point: outline[1],
							widthDirection: 1,
							depthDirection: -1,
							cursor: "cursor-nesw-resize",
						},
						{
							point: midpoint(outline[1], outline[2]),
							widthDirection: 1,
							depthDirection: 0,
							cursor: "cursor-ew-resize",
						},
						{
							point: outline[2],
							widthDirection: 1,
							depthDirection: 1,
							cursor: "cursor-nwse-resize",
						},
						{
							point: midpoint(outline[2], outline[3]),
							widthDirection: 0,
							depthDirection: 1,
							cursor: "cursor-ns-resize",
						},
						{
							point: outline[3],
							widthDirection: -1,
							depthDirection: 1,
							cursor: "cursor-nesw-resize",
						},
						{
							point: midpoint(outline[3], outline[0]),
							widthDirection: -1,
							depthDirection: 0,
							cursor: "cursor-ew-resize",
						},
					] as const;
					return svg`
					${edges.map((edge) => {
						const horizontal = edge.start.y === edge.end.y;
						const start = horizontal
							? edge.start.x <= edge.end.x
								? edge.start
								: edge.end
							: edge.start.y <= edge.end.y
								? edge.start
								: edge.end;
						const end = start === edge.start ? edge.end : edge.start;
						const dashCoordinate = horizontal ? start.x : start.y;
						return svg`<line
							x1=${start.x}
							y1=${start.y}
							x2=${end.x}
							y2=${end.y}
							fill="none"
							stroke=${accent}
							stroke-width="5"
							stroke-dasharray=${selectionDashPattern}
							stroke-dashoffset=${dashCoordinate % selectionDashPeriod}
							vector-effect="non-scaling-stroke"
							pointer-events="none"
						/>`;
					})}
					${edges.map(
						(edge) => svg`<line
							x1=${edge.start.x}
							y1=${edge.start.y}
							x2=${edge.end.x}
							y2=${edge.end.y}
							stroke="transparent"
							stroke-width="18"
							pointer-events="stroke"
							class=${edge.cursor}
							@pointerdown=${(event: PointerEvent) =>
								startFloorResize(
									event,
									world,
									edge.widthDirection,
									edge.depthDirection,
									dispatch,
								)}
						/>`,
					)}
					${handles.map(
						(handle) => svg`<rect
							x=${handle.point.x - selectionHandleSize / 2}
							y=${handle.point.y - selectionHandleSize / 2}
							width=${selectionHandleSize}
							height=${selectionHandleSize}
							rx="3"
							fill=${accent}
							stroke="#503b37"
							stroke-width="3"
							class=${handle.cursor}
							@pointerdown=${(event: PointerEvent) =>
								startFloorResize(
									event,
									world,
									handle.widthDirection,
									handle.depthDirection,
									dispatch,
								)}
						/>`,
					)}
				`;
				}

				const position = world.positions.get(selected);
				const body = world.bodies.get(selected);
				if (position === undefined || body === undefined) return svg``;
				const outline = projectedRectangle(
					position,
					body,
					entityBaseElevation(world, selected),
				);
				const edges: ReadonlyArray<{
					readonly start: Position;
					readonly end: Position;
					readonly widthDirection: ResizeDirection;
					readonly depthDirection: ResizeDirection;
					readonly cursor: string;
				}> = [
					{
						start: outline[0],
						end: outline[1],
						widthDirection: 0,
						depthDirection: -1,
						cursor: "cursor-ns-resize",
					},
					{
						start: outline[1],
						end: outline[2],
						widthDirection: 1,
						depthDirection: 0,
						cursor: "cursor-ew-resize",
					},
					{
						start: outline[2],
						end: outline[3],
						widthDirection: 0,
						depthDirection: 1,
						cursor: "cursor-ns-resize",
					},
					{
						start: outline[3],
						end: outline[0],
						widthDirection: -1,
						depthDirection: 0,
						cursor: "cursor-ew-resize",
					},
				];
				const handles: ReadonlyArray<{
					readonly point: Position;
					readonly widthDirection: ResizeDirection;
					readonly depthDirection: ResizeDirection;
					readonly cursor: string;
				}> = [
					{
						point: outline[0],
						widthDirection: -1,
						depthDirection: -1,
						cursor: "cursor-nwse-resize",
					},
					{
						point: midpoint(outline[0], outline[1]),
						widthDirection: 0,
						depthDirection: -1,
						cursor: "cursor-ns-resize",
					},
					{
						point: outline[1],
						widthDirection: 1,
						depthDirection: -1,
						cursor: "cursor-nesw-resize",
					},
					{
						point: midpoint(outline[1], outline[2]),
						widthDirection: 1,
						depthDirection: 0,
						cursor: "cursor-ew-resize",
					},
					{
						point: outline[2],
						widthDirection: 1,
						depthDirection: 1,
						cursor: "cursor-nwse-resize",
					},
					{
						point: midpoint(outline[2], outline[3]),
						widthDirection: 0,
						depthDirection: 1,
						cursor: "cursor-ns-resize",
					},
					{
						point: outline[3],
						widthDirection: -1,
						depthDirection: 1,
						cursor: "cursor-nesw-resize",
					},
					{
						point: midpoint(outline[3], outline[0]),
						widthDirection: -1,
						depthDirection: 0,
						cursor: "cursor-ew-resize",
					},
				];
				return svg`
				<polygon points=${points(outline)} fill="none" stroke=${accent} stroke-width="4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" pointer-events="none" />
				${edges.map(
					(edge) => svg`<line
						x1=${edge.start.x}
						y1=${edge.start.y}
						x2=${edge.end.x}
						y2=${edge.end.y}
						stroke="transparent"
						stroke-width="18"
						pointer-events="stroke"
						class=${edge.cursor}
						@pointerdown=${(event: PointerEvent) =>
							startEntityResize(
								event,
								world,
								selected,
								edge.widthDirection,
								edge.depthDirection,
								dispatch,
							)}
					/>`,
				)}
				${handles.map(
					(handle) => svg`<rect
							x=${handle.point.x - selectionHandleSize / 2}
							y=${handle.point.y - selectionHandleSize / 2}
							width=${selectionHandleSize}
							height=${selectionHandleSize}
							rx="3"
							fill=${accent}
							stroke="#503b37"
							stroke-width="3"
							class=${handle.cursor}
							@pointerdown=${(event: PointerEvent) =>
								startEntityResize(
									event,
									world,
									selected,
									handle.widthDirection,
									handle.depthDirection,
									dispatch,
								)}
						/>`,
				)}
			`;
			};

			const numberInput = (
				label: string,
				value: number,
				minimum: number,
				maximum: number | undefined,
				onChange: (value: number) => void,
			): TemplateResult => html`
			<label class="block min-w-0 flex-1 text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
				${label}
				<input
					type="number"
					.value=${String(Math.round(value))}
					min=${minimum}
					max=${maximum ?? ""}
					step="10"
					class="mt-2 block w-full rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[14px] font-semibold text-[#fff1d6] outline-none focus:border-[#e8b875]"
					@change=${(event: Event) => {
						const input = event.currentTarget;
						if (
							input instanceof HTMLInputElement &&
							Number.isFinite(input.valueAsNumber)
						)
							onChange(input.valueAsNumber);
					}}
				/>
			</label>
		`;

			const editorPanelTemplate = (
				world: World,
				panelVisible: boolean,
				dispatch: Dispatch,
			): TemplateResult => {
				const selected = world.editor.selected;
				const selectedEntity =
					selected === null || selected === "floor" ? undefined : selected;
				const selectedBody =
					selectedEntity === undefined
						? undefined
						: world.bodies.get(selectedEntity);
				const selectedPosition =
					selectedEntity === undefined
						? undefined
						: world.positions.get(selectedEntity);
				const selectedMaximumBody =
					selectedEntity === undefined
						? undefined
						: maximumEditorBody(world, selectedEntity);
				const selectedHeight =
					selectedEntity === undefined
						? undefined
						: editorEntityHeight(world, selectedEntity);
				const selectedHeightLimits =
					selectedEntity === undefined
						? undefined
						: editorEntityHeightLimits(world, selectedEntity);
				const selectedSignContent =
					selectedEntity === undefined ||
					world.decorations.get(selectedEntity)?.kind !== DecorationKinds.Sign
						? undefined
						: (world.signContents.get(selectedEntity) ?? defaultSignContent);
				return html`
				<aside data-editor-panel class=${`absolute top-0 right-0 z-30 flex h-full w-85 flex-col overscroll-contain border-l border-[#41565a] bg-[#0d181f]/98 text-[#fff1d6] shadow-[-18px_0_44px_rgba(3,9,12,0.38)] transition-transform duration-180 ease-out motion-reduce:transition-none ${panelVisible ? "translate-x-0" : "pointer-events-none translate-x-full"}`}>
					<header class="border-b border-[#30434a] px-5 pt-6 pb-4">
						<div class="text-lg font-heading font-bold tracking-[0.2em] text-[#e8b875] uppercase">Design studio</div>
						<div class="text-[11px] leading-relaxed text-[#819993]">Scroll to pan · Command/Control-drag to pan</div>
					</header>

					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
						<section>
							<div class="flex items-end justify-between">
								<h2 class="m-0 text-[12px] font-heading font-bold tracking-[0.16em] text-[#aebfba] uppercase">Add objects</h2>
								<span class="text-[10px] text-[#708780]">DRAG TO PLACE</span>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-2">
								${paletteItems.map(
									(item) => html`
										<button
											data-palette-item
											type="button"
											class="group cursor-grab touch-none rounded-xl border border-[#30464c] bg-[#17272e] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#d9a969] hover:bg-[#20343b] active:cursor-grabbing"
											@pointerdown=${(event: PointerEvent) =>
												startPaletteDrag(event, item.kind, world)}
										>
											<span class="text-[22px] text-[#e8b875]">${item.icon}</span>
											<span class="mt-1 block text-[13px] font-bold">${item.label}</span>
											<span class="mt-0.5 block text-[10px] leading-snug text-[#819993]">${item.description}</span>
										</button>
									`,
								)}
							</div>
						</section>

						<section class="mt-6 border-t border-[#30434a] pt-5">
							<h2 class="m-0 text-[12px] font-heading font-bold tracking-[0.16em] text-[#aebfba] uppercase">Selection</h2>
							${
								selected === "floor"
									? html`
										<div class="mt-3 rounded-xl bg-[#17272e] p-4">
											<div class="text-[15px] font-bold">Floor plan</div>
											<div class="mt-1 text-[11px] leading-relaxed text-[#819993]">Drag any gold edge or handle, or enter exact dimensions.</div>
											<div class="mt-4 flex gap-3">
												${numberInput(
													"Width",
													world.floorPlan.width,
													minimumFloorWidth,
													undefined,
													(width) =>
														dispatch(
															Action.EditorFloorResized({
																floorPlan: { ...world.floorPlan, width },
															}),
														),
												)}
												${numberInput(
													"Depth",
													world.floorPlan.depth,
													minimumFloorDepth,
													undefined,
													(depth) =>
														dispatch(
															Action.EditorFloorResized({
																floorPlan: { ...world.floorPlan, depth },
															}),
														),
												)}
												</div>
										</div>
									`
									: selectedEntity !== undefined &&
											selectedBody !== undefined &&
											selectedPosition !== undefined &&
											selectedMaximumBody !== undefined
										? html`
											<div class="mt-3 rounded-xl bg-[#17272e] p-4">
												<div class="flex items-start justify-between gap-3">
													<div>
														<div class="text-[15px] font-bold">${entityLabel(world, selectedEntity)}</div>
														<div class="mt-1 text-[10px] text-[#819993]">X ${Math.round(selectedPosition.x)} · Y ${Math.round(selectedPosition.y)}</div>
													</div>
									<button type="button" class="rounded-lg border border-[#704a45] px-2.5 py-1.5 text-[10px] font-bold text-[#ef9f8e] hover:bg-[#3a2425]" @click=${() => dispatch(Action.EditorDeleteSelected())}>DELETE</button>
												</div>
												<div class="mt-4 flex gap-3">
													${numberInput(
														"Width",
														selectedBody.width,
														minimumEntityExtent,
														selectedMaximumBody.width,
														(width) =>
															dispatch(
																Action.EditorEntityResized({
																	entity: selectedEntity,
																	body: { ...selectedBody, width },
																}),
															),
													)}
											${numberInput(
												"Depth",
												selectedBody.depth,
												minimumEntityExtent,
												selectedMaximumBody.depth,
												(depth) =>
													dispatch(
														Action.EditorEntityResized({
															entity: selectedEntity,
															body: { ...selectedBody, depth },
														}),
													),
											)}
											${
												selectedHeight !== undefined &&
												selectedHeightLimits !== undefined &&
												selectedHeightLimits.maximum > 0
													? numberInput(
															"Height",
															selectedHeight,
															selectedHeightLimits.minimum,
															selectedHeightLimits.maximum,
															(height) =>
																dispatch(
																	Action.EditorEntityHeightChanged({
																		entity: selectedEntity,
																		height,
																	}),
																),
														)
													: html``
											}
										</div>
										${
											selectedSignContent === undefined
												? html``
												: html`
													<div class="mt-5 border-t border-[#30434a] pt-4">
														<label class="block text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
															Title
															<input
																type="text"
																.value=${selectedSignContent.title}
																class="mt-2 block w-full rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[14px] font-semibold text-[#fff1d6] outline-none focus:border-[#e8b875]"
																@change=${(event: Event) => {
																	const input = event.currentTarget;
																	if (!(input instanceof HTMLInputElement))
																		return;
																	dispatch(
																		Action.EditorSignContentChanged({
																			entity: selectedEntity,
																			content: {
																				...selectedSignContent,
																				title: input.value,
																			},
																		}),
																	);
																}}
															/>
														</label>
														<label class="mt-4 block text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
															Body
															<textarea
																.value=${selectedSignContent.body}
																rows="5"
																class="mt-2 block w-full resize-y rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[13px] leading-relaxed text-[#fff1d6] outline-none focus:border-[#e8b875]"
																@change=${(event: Event) => {
																	const input = event.currentTarget;
																	if (!(input instanceof HTMLTextAreaElement))
																		return;
																	dispatch(
																		Action.EditorSignContentChanged({
																			entity: selectedEntity,
																			content: {
																				...selectedSignContent,
																				body: input.value,
																			},
																		}),
																	);
																}}
															></textarea>
														</label>
													</div>
												`
										}
									</div>
										`
										: html`<div class="mt-3 rounded-xl border border-dashed border-[#30464c] px-4 py-5 text-center text-[11px] leading-relaxed text-[#819993]">Select an object to move or resize it.<br />Select the floor to change the plan.</div>`
							}
						</section>
					</div>

					<footer class="border-t border-[#30434a] px-5 py-4 text-[10px] leading-relaxed text-[#718780]">
						Drag objects to move · Scroll to pan<br />⌘/Ctrl-drag pans · Delete removes a selection
					</footer>
				</aside>
			`;
			};

			const invalidPlacementTemplate = (
				world: World,
				presentation: EditSessionPresentation,
				dispatch: Dispatch,
			): TemplateResult => {
				const invalidPlacement = world.editor.invalidPlacement;
				const occupiedSupport =
					invalidPlacement?.kind === "entity" &&
					isSupportSurfaceOccupied(
						world,
						invalidPlacement.entity,
						invalidPlacement.position,
						invalidPlacement.body,
					);
				const description =
					presentation.rejectionReason === "floor-excludes-editor-item"
						? "The floor plan must contain every existing object."
						: presentation.rejectionReason === "occupied-support"
							? "Move every object off this platform before moving or shrinking it."
							: invalidPlacement?.kind === "floor"
								? "The floor plan must contain every existing object."
								: occupiedSupport
									? "Move every object off this platform before moving, shrinking, or deleting it."
									: "Keep the object inside the floor plan and clear of other objects.";
				return html`
				<div class="editor-invalid-cursor absolute inset-0 z-50 flex items-center justify-center bg-[#071015]/48 px-6" role="presentation">
					<div class="w-full max-w-95 rounded-2xl border border-[#7d4b4b] bg-[#15242b] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" role="alertdialog" aria-modal="true" aria-labelledby="invalid-position-title" aria-describedby="invalid-position-description">
						<div id="invalid-position-title" class="text-[17px] font-heading font-bold tracking-[0.04em] text-[#e59a91]">Invalid position</div>
						<p id="invalid-position-description" class="mt-2 mb-0 text-base leading-relaxed text-[#b9cbc4]">${description}</p>
						<div class="mt-5 flex justify-end">
							<button type="button" autofocus class="rounded-lg border border-[#9a625d] bg-[#6f3f3e] px-5 py-2 text-[11px] font-bold tracking-[0.12em] text-[#fff1ed] transition hover:bg-[#80504d]" @click=${() => dispatch(presentation.active ? Action.EditorEditSessionCancelled() : Action.EditorInvalidPlacementDismissed())}>OK</button>
						</div>
					</div>
				</div>
			`;
			};

			const signDialogTemplate = (
				world: World,
				dispatch: Dispatch,
			): TemplateResult => {
				const content =
					world.readingSign === null
						? defaultSignContent
						: (world.signContents.get(world.readingSign) ?? defaultSignContent);
				return html`
			<div class="absolute inset-0 z-50 flex items-center justify-center bg-[#071015]/48 px-6" role="presentation">
				<div class="flex max-h-[calc(100vh-3rem)] w-full max-w-95 flex-col border border-[#8b633c] bg-[#ecd19e] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" role="alertdialog" aria-modal="true" aria-labelledby="sign-title" aria-describedby="sign-description">
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain pr-2">
						<div id="sign-title" class="wrap-break-word text-[17px] font-heading font-bold tracking-[0.04em] text-[#4b2f1e]">${content.title}</div>
						<p id="sign-description" class="mt-2 mb-0 wrap-break-word whitespace-pre-wrap text-base leading-relaxed text-[#5d3b24]">${content.body}</p>
					</div>
					<div class="mt-5 flex justify-end">
						<button type="button" autofocus class="rounded-lg border border-[#5d3b24] bg-[#70462b] px-5 py-2 text-[11px] font-bold tracking-[0.12em] text-[#fff3dc] transition hover:bg-[#845535]" @click=${() => dispatch(Action.SignDismissed())}>DISMISS</button>
					</div>
				</div>
			</div>
		`;
			};

			const activePlacementIsInvalid = (world: World): boolean => {
				if (currentPresentation?.active === true)
					return currentPresentation.invalidPreview;
				const interaction = activeInteraction;
				if (interaction?.kind === "create")
					return (
						interaction.canDrop &&
						!isNewEditorItemPlacementValid(
							world,
							interaction.itemKind,
							interaction.position,
							defaultEditorItemBody(interaction.itemKind),
						)
					);
				if (interaction?.kind === "resize-floor")
					return !isFloorPlanPlacementValid(world, world.floorPlan);
				if (interaction?.kind !== "move" && interaction?.kind !== "resize")
					return false;
				const position = world.positions.get(interaction.entity);
				const body = world.bodies.get(interaction.entity);
				return (
					position !== undefined &&
					body !== undefined &&
					!isEntityPlacementValid(world, interaction.entity, position, body, {
						position: interaction.position,
						body: interaction.body,
					})
				);
			};

			const createPreviewTemplate = (
				world: World,
				invalidPreview: boolean,
			): TemplateResult => {
				const interaction = activeInteraction;
				if (interaction?.kind !== "create") return html``;
				const body = defaultEditorItemBody(interaction.itemKind);
				const position = interaction.position;
				const baseElevation = placementElevationForKind(
					world,
					interaction.itemKind,
					position,
					body,
				);
				const height = defaultEditorItemHeight(interaction.itemKind);
				const visual =
					interaction.itemKind === EditorItemKinds.Crate
						? crateTemplate(position, body, height, false, baseElevation)
						: interaction.itemKind === EditorItemKinds.Chest
							? chestTemplate(position, body, height, false, baseElevation)
							: interaction.itemKind === EditorItemKinds.Wall
								? boxTemplate(
										position,
										body,
										height,
										{ top: "#426772", front: "#29454f" },
										"",
										baseElevation,
									)
								: interaction.itemKind === EditorItemKinds.Platform
									? boxTemplate(
											position,
											body,
											height,
											{ top: "#77927e", front: "#4f6c61" },
											"",
											baseElevation,
										)
									: decorationTemplate(
											position,
											body,
											Decoration.make({
												kind:
													interaction.itemKind === EditorItemKinds.Rug
														? DecorationKinds.Rug
														: interaction.itemKind === EditorItemKinds.Plant
															? DecorationKinds.Plant
															: interaction.itemKind === EditorItemKinds.Sign
																? DecorationKinds.Sign
																: DecorationKinds.Lamp,
												height,
											}),
											baseElevation,
										);
				const accent = invalidPreview ? "#e59a91" : "#fff0a8";
				return html`
				<svg data-editor-create-preview data-can-drop=${String(interaction.canDrop)} aria-hidden="true" class="pointer-events-none absolute inset-0 z-40 h-full w-full" viewBox=${`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet">
					<g transform=${`translate(${world.editor.camera.x} ${world.editor.camera.y})`}>
						<g opacity="0.82">${visual}</g>
						<polygon data-editor-create-outline points=${points(projectedRectangle(position, body, baseElevation))} fill="none" stroke=${accent} stroke-width="4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" />
					</g>
				</svg>
			`;
			};

			const renderWorld = (
				authoredWorld: World,
				world: World,
				presentation: EditSessionPresentation,
				dispatch: Dispatch,
			): void => {
				currentWorld = authoredWorld;
				currentViewWorld = world;
				currentPresentation = presentation;
				currentDispatch = dispatch;
				if (authoredWorld.editor.invalidPlacement !== null)
					activeInteraction = undefined;
				const playerPosition = world.positions.get(playerEntity);
				const playerElevation = world.elevations.get(playerEntity);
				if (playerPosition === undefined || playerElevation === undefined)
					return;
				const playerSurface = surfaceAt(
					world,
					playerPosition,
					playerBody,
					playerElevation.z,
				);

				const camera = world.editor.open
					? world.editor.camera
					: world.gameCamera;
				const invalidPreview = activePlacementIsInvalid(authoredWorld);
				const floor = projectedRectangle(
					{
						x: world.floorOrigin.x + world.floorPlan.width / 2,
						y: world.floorOrigin.y + world.floorPlan.depth / 2,
					},
					world.floorPlan,
				);
				const floorTiles = outdoorFloorTiles(
					world.floorTiles,
					project(world.floorTileOrigin),
					{
						left: -camera.x,
						top: -camera.y,
						width: viewport.width,
						height: viewport.height,
					},
				);
				const gridLines = interiorGridCoordinates(
					world.floorPlan.width,
					floorGridSpacing.x,
				).map((offset) => {
					const x = world.floorOrigin.x + offset;
					return svg`<line x1=${project({ x, y: world.floorOrigin.y }).x} y1=${project({ x, y: world.floorOrigin.y }).y} x2=${project({ x, y: world.floorOrigin.y + world.floorPlan.depth }).x} y2=${project({ x, y: world.floorOrigin.y + world.floorPlan.depth }).y} />`;
				});
				const depthLines = interiorGridCoordinates(
					world.floorPlan.depth,
					floorGridSpacing.y,
				).map((offset) => {
					const y = world.floorOrigin.y + offset;
					return svg`<line x1=${project({ x: world.floorOrigin.x, y }).x} y1=${project({ x: world.floorOrigin.x, y }).y} x2=${project({ x: world.floorOrigin.x + world.floorPlan.width, y }).x} y2=${project({ x: world.floorOrigin.x + world.floorPlan.width, y }).y} />`;
				});
				const playerDepth = renderDepthForPlayer(world);

				const objects: Array<{
					readonly depth: number;
					readonly entity?: EntityId;
					readonly template: TemplateResult;
				}> = [];
				for (const [entity, obstacle] of world.obstacles) {
					const position = world.positions.get(entity);
					const body = world.bodies.get(entity);
					if (position === undefined || body === undefined) continue;
					const baseElevation = entityBaseElevation(world, entity);
					const template =
						obstacle.kind === ObstacleKinds.Crate
							? crateTemplate(
									position,
									body,
									obstacle.height,
									world.grabbed === entity,
									baseElevation,
									shadowSectionsForEntity(world, entity, position, body),
								)
							: obstacle.kind === ObstacleKinds.Chest
								? chestTemplate(
										position,
										body,
										obstacle.height,
										world.openedChests.has(entity),
										baseElevation,
									)
								: obstacle.kind === ObstacleKinds.Wall
									? boxTemplate(
											position,
											body,
											obstacle.height,
											{
												top: "#426772",
												front: "#29454f",
											},
											"",
											baseElevation,
										)
									: boxTemplate(
											position,
											body,
											obstacle.height,
											{
												top: "#77927e",
												front: "#4f6c61",
											},
											"",
											baseElevation,
										);
					objects.push({
						depth: renderDepthForEntity(world, entity),
						entity,
						template,
					});
				}
				for (const [entity, decoration] of world.decorations) {
					const position = world.positions.get(entity);
					const body = world.bodies.get(entity);
					if (position === undefined || body === undefined) continue;
					objects.push({
						depth:
							decoration.kind === DecorationKinds.Rug
								? Number.NEGATIVE_INFINITY
								: renderDepthForEntity(world, entity),
						entity,
						template: decorationTemplate(
							position,
							body,
							decoration,
							entityBaseElevation(world, entity),
							world.grabbed === entity,
						),
					});
				}
				if (!world.editor.open) {
					objects.push({
						depth: playerDepth,
						template: playerTemplate(
							playerPosition,
							playerElevation,
							playerSurface,
							world.playerFacing,
							world.grabbed !== null || world.pushing !== null,
						),
					});
				}
				objects.sort((left, right) => left.depth - right.depth);

				const floorPointerDown = (event: PointerEvent): void => {
					if (!world.editor.open) return;
					event.stopPropagation();
					if (isPanGesture(event)) {
						startPan(event, world);
					} else if (event.button === 0) {
						dispatch(Action.EditorSelectionChanged({ selection: "floor" }));
					}
				};
				const canvasPointerDown = (event: PointerEvent): void => {
					if (!world.editor.open) return;
					if (isPanGesture(event)) {
						startPan(event, world);
					} else if (event.button === 0) {
						dispatch(Action.EditorSelectionChanged({ selection: null }));
					}
				};

				render(
					html`
					<main class=${`relative h-screen w-screen overflow-hidden bg-[#14212a] ${activeInteraction !== undefined && activeInteraction.kind !== "pan" ? "editor-active-gesture" : ""} ${invalidPreview ? "editor-invalid-preview-root" : ""}`} @pointerdown=${(
						event: PointerEvent,
					) => {
						const target = event.target;
						if (
							target instanceof Element &&
							target.closest("[data-palette-item]") !== null
						)
							return;
						const dismissed = dismissPalettePopover(designStudioInteraction);
						if (dismissed !== designStudioInteraction) {
							designStudioInteraction = dismissed;
							popoverFading = false;
							refreshLocalState();
						}
					}}>
						<svg
							id="world-canvas"
							class=${`block h-full w-full ${world.editor.open ? `world-editor-canvas touch-none select-none ${invalidPreview ? "editor-invalid-preview" : ""}` : ""}`}
							viewBox=${`0 0 ${viewport.width} ${viewport.height}`}
							preserveAspectRatio="xMidYMid meet"
							role="img"
							aria-label=${world.editor.open ? "Infinite canvas design studio" : "Room exploration game"}
							@pointerdown=${canvasPointerDown}
						>
							<defs>
								<pattern id="editor-dots" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform=${`translate(${camera.x % 32} ${camera.y % 32})`}>
									<circle cx="2" cy="2" r="1.6" fill="#3b5157" />
								</pattern>
								<clipPath id="outdoor-floor-clip" clipPathUnits="userSpaceOnUse">
									<polygon points=${points(floor)} />
								</clipPath>
							</defs>
							${world.editor.open ? svg`<rect width="100%" height="100%" fill="url(#editor-dots)" opacity="0.68" />` : svg``}
							<g transform=${`translate(${camera.x} ${camera.y})`}>
								<polygon data-floor-base points=${points(floor)} fill="#c9b385" @pointerdown=${floorPointerDown} />
								<g pointer-events="none" stroke="#8f8065" stroke-width=${floorGridStrokeWidth} opacity=${floorGridOpacity}>${gridLines}${depthLines}</g>
								<g data-outdoor-floor-tiles clip-path="url(#outdoor-floor-clip)" pointer-events="none">
									${terrainFloorTemplate(floorTiles)}
								</g>
								${objects.map(({ entity, template }) =>
									entity === undefined
										? template
										: svg`<g class=${world.editor.open ? "cursor-move" : ""} @pointerdown=${(event: PointerEvent) => startEntityMove(event, world, entity, dispatch)}>${template}</g>`,
								)}
								${world.editor.open ? selectionTemplate(world, invalidPreview, dispatch) : svg``}
							</g>
						</svg>

						<h1 class="pointer-events-none absolute top-7 left-7 m-0 select-none text-[27px] font-heading font-bold tracking-[0.16em] text-[#fff1d6]">SAISHUMIN</h1>
						<div
							class=${`absolute top-6 z-40 flex flex-col items-end gap-2 ${world.editor.open && !presentation.active ? "right-[360px]" : "right-6"}`}
						>
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-xl border border-[#e8b875]/70 bg-[#0d181f]/92 px-4 py-3 text-[12px] font-bold tracking-[0.12em] text-[#fff1d6] shadow-lg transition-colors hover:bg-[#1b2d34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff1d6]"
								@click=${() => dispatch(Action.EditorToggled())}
							>${
								world.editor.open
									? svg`<svg
										class="size-4"
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
									</svg>
									PLAY`
									: svg`<svg
									class="size-4"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" />
									<path d="m18 15 4-4" />
									<path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
								</svg>
								DESIGN STUDIO`
							}</button>
						</div>

						${
							world.editor.open
								? html`<div class="pointer-events-none absolute bottom-6 left-7 rounded-xl bg-[#0d181f]/88 px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-[#e8b875]">CONTROLS PAUSED · INFINITE PAN · FIXED SCALE</div>${editorPanelTemplate(world, !presentation.active, dispatch)}`
								: html`
									<div class="pointer-events-none absolute bottom-7 left-7 flex max-w-[calc(100vw-3.5rem)] flex-wrap gap-x-12 gap-y-3 rounded-[18px] bg-[#0d181f]/90 px-6 py-4 select-none">
										<div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">ARROW KEYS</div><div class="mt-1 text-[13px] text-[#aebfba]">MOVE · PUSH CRATES</div></div>
										<div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">SPACE</div><div class="mt-1 text-[13px] text-[#aebfba]">JUMP · CLIMB · FALL</div></div>
										<div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">HOLD SHIFT</div><div class="mt-1 text-[13px] text-[#aebfba]">GRAB · DRAG OBJECTS</div></div>
										<div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">X</div><div class="mt-1 text-[13px] text-[#aebfba]">OPEN CHESTS · READ SIGNS</div></div>
									</div>
								`
						}
						<div id="editor-create-preview-host" class="contents"></div>
						${designStudioInteraction.popover === null ? html`` : html`<div role="status" class=${`pointer-events-none fixed z-50 w-60 rounded-xl border border-[#d9a969] bg-[#17272e] px-4 py-3 text-[13px] font-semibold text-[#fff1d6] shadow-xl transition-opacity duration-200 ${popoverFading ? "opacity-0" : "opacity-100"}`} style=${`left: ${Math.max(12, designStudioInteraction.popover.itemBounds.left - 252)}px; top: ${designStudioInteraction.popover.itemBounds.top}px;`}>Drag this item onto the room to place it.</div>`}
						${world.editor.invalidPlacement === null && !presentation.invalidReleased ? html`` : invalidPlacementTemplate(world, presentation, dispatch)}
						${world.readingSign === null ? html`` : signDialogTemplate(world, dispatch)}
					</main>
				`,
					document.body,
				);
			};
			refreshCreatePreview = () => {
				const world = currentWorld;
				const host = document.querySelector("#editor-create-preview-host");
				if (world === undefined || !(host instanceof HTMLElement)) return;
				const creating = activeInteraction?.kind === "create";
				const invalid = creating && activePlacementIsInvalid(world);
				const main = host.closest("main");
				main?.classList.toggle(
					"editor-active-gesture",
					activeInteraction !== undefined && activeInteraction.kind !== "pan",
				);
				main?.classList.toggle("editor-invalid-preview-root", invalid);
				document
					.querySelector("#world-canvas")
					?.classList.toggle("editor-invalid-preview", invalid);
				render(creating ? html`` : createPreviewTemplate(world, invalid), host);
			};
			refreshLocalState = () => {
				if (
					currentWorld !== undefined &&
					currentViewWorld !== undefined &&
					currentPresentation !== undefined &&
					currentDispatch !== undefined
				)
					renderWorld(
						currentWorld,
						currentViewWorld,
						currentPresentation,
						currentDispatch,
					);
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
						currentViewWorld = undefined;
						currentPresentation = undefined;
						currentDispatch = undefined;
					}),
			);
			return { render: renderWorld };
		}),
	);
}
