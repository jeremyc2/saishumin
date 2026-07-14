import { Context, Layer } from "effect";
import { html, render, svg, type TemplateResult } from "lit-html";
import { supportSurfaceAt, surfaceAt } from "../ecs/collision";
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
	maximumFloorExtent,
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	obstacleHeightTolerance,
	playerBody,
	playerEntity,
	stationaryVelocity,
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
	defaultEditorItemBody,
	defaultEditorItemHeight,
	type EditorItemKind,
	EditorItemKinds,
} from "../model/editor";
import type { EntityId } from "../model/entity-id";
import {
	type PlayerTrailMark,
	playerTrailMarkSpacing,
} from "../model/player-trail";
import { editorPlacementPositionAtPointer } from "../render/editor-placement-projection";
import {
	renderDepthForEntity,
	renderDepthForPlayer,
	renderDepthForSurfacePoint,
} from "../render/entity-render-depth";
import { playerTireTrackSurfaceOutline } from "../render/player-tire-track";
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
	playerTireTrackCenter,
	playerTireTrackIsTurning,
	playerTireTrackTreadTemplate,
} from "../render/templates";

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
			readonly originOffset: Position;
	  };

const floorGridSpacing = { x: 100, y: 80 } as const;
const floorGridStrokeWidth = 2;
const floorGridOpacity = 0.32;
const selectionHandleSize = 16;
const wheelLinePixels = 16;
const minimumEntityBody = {
	width: minimumEntityExtent,
	depth: minimumEntityExtent,
} as const;
const minimumFloorBody = {
	width: minimumFloorWidth,
	depth: minimumFloorDepth,
} as const;
const maximumFloorBody = {
	width: maximumFloorExtent,
	depth: maximumFloorExtent,
} as const;

const midpoint = (start: Position, end: Position): Position => ({
	x: (start.x + end.x) / 2,
	y: (start.y + end.y) / 2,
});

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

const interiorGridCoordinates = (
	extent: number,
	spacing: number,
): ReadonlyArray<number> =>
	Array.from(
		{ length: Math.max(0, Math.ceil(extent / spacing) - 1) },
		(_, index) => (index + 1) * spacing,
	);

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
		readonly render: (world: World, dispatch: Dispatch) => void;
	}
>()("saishumin/systems/render-system-service/RenderSystemService") {
	static readonly layer = Layer.sync(this, () => {
		let currentWorld: World | undefined;
		let currentDispatch: Dispatch | undefined;
		let activeInteraction: ActiveInteraction | undefined;
		let refreshCreatePreview = (): void => {};

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
		};

		const startEntityResize = (
			event: PointerEvent,
			world: World,
			entity: EntityId,
			widthDirection: ResizeDirection,
			depthDirection: ResizeDirection,
		): void => {
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
			activeInteraction = {
				kind: "resize",
				entity,
				pointer,
				position,
				body,
				widthDirection,
				depthDirection,
			};
		};

		const startFloorResize = (
			event: PointerEvent,
			world: World,
			widthDirection: ResizeDirection,
			depthDirection: ResizeDirection,
		): void => {
			event.stopPropagation();
			if (isPanGesture(event)) {
				startPan(event, world);
				return;
			}
			if (event.button !== 0) return;
			const pointer = svgPosition(event.clientX, event.clientY);
			if (pointer === undefined) return;
			event.preventDefault();
			activeInteraction = {
				kind: "resize-floor",
				pointer,
				floorPlan: world.floorPlan,
				widthDirection,
				depthDirection,
				originOffset: { x: 0, y: 0 },
			};
		};

		const startPaletteDrag = (
			event: PointerEvent,
			itemKind: EditorItemKind,
			world: World,
		): void => {
			if (event.button !== 0) return;
			const position = pointerWorldPosition(event, world.editor.camera);
			if (position === undefined) return;
			event.preventDefault();
			activeInteraction = {
				kind: "create",
				itemKind,
				pointer: { x: event.clientX, y: event.clientY },
				position,
				canDrop: false,
			};
			refreshCreatePreview();
		};

		window.addEventListener("pointermove", (event) => {
			const interaction = activeInteraction;
			const world = currentWorld;
			const dispatch = currentDispatch;
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
				const target = document.elementFromPoint(event.clientX, event.clientY);
				activeInteraction = {
					...interaction,
					position,
					canDrop:
						target instanceof Element &&
						target.closest("#world-canvas") !== null,
				};
				refreshCreatePreview();
				return;
			}

			if (interaction.kind === "resize-floor") {
				const pointer = svgPosition(event.clientX, event.clientY);
				if (pointer === undefined) return;
				const resized = resizeFromHandle(
					{
						x: interaction.floorPlan.width / 2,
						y: interaction.floorPlan.depth / 2,
					},
					interaction.floorPlan,
					{
						x: pointer.x - interaction.pointer.x,
						y: (pointer.y - interaction.pointer.y) / Math.SQRT1_2,
					},
					interaction.widthDirection,
					interaction.depthDirection,
					minimumFloorBody,
					maximumFloorBody,
				);
				const originOffset = {
					x: resized.position.x - resized.body.width / 2,
					y: resized.position.y - resized.body.depth / 2,
				};
				const originDelta = {
					x: originOffset.x - interaction.originOffset.x,
					y: originOffset.y - interaction.originOffset.y,
				};
				activeInteraction = { ...interaction, originOffset };
				dispatch(
					Action.EditorFloorResized({
						floorPlan: resized.body,
						originDelta,
						preview: true,
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
					Action.EditorEntityMoved({
						entity: interaction.entity,
						position,
						originalPosition: interaction.position,
						originalBody: interaction.body,
						preview: true,
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
					Action.EditorEntityResized({
						entity: interaction.entity,
						body: resized.body,
						position: resized.position,
						originalPosition: interaction.position,
						originalBody: interaction.body,
						preview: true,
					}),
				);
			}
		});

		window.addEventListener("pointerup", (event) => {
			const interaction = activeInteraction;
			const world = currentWorld;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			refreshCreatePreview();
			if (
				interaction?.kind === "create" &&
				world?.editor.open === true &&
				dispatch !== undefined
			) {
				const distance = Math.hypot(
					event.clientX - interaction.pointer.x,
					event.clientY - interaction.pointer.y,
				);
				if (distance > 8) {
					const dropTarget = document.elementFromPoint(
						event.clientX,
						event.clientY,
					);
					if (
						dropTarget instanceof Element &&
						dropTarget.closest("#world-canvas") !== null
					) {
						dispatch(
							Action.EditorItemAdded({
								kind: interaction.itemKind,
								position: interaction.position,
							}),
						);
					}
				}
			}
			if (
				(interaction?.kind === "move" || interaction?.kind === "resize") &&
				dispatch !== undefined
			) {
				dispatch(
					Action.EditorEntityInteractionFinished({
						entity: interaction.entity,
						originalPosition: interaction.position,
						originalBody: interaction.body,
					}),
				);
			} else if (
				interaction?.kind === "resize-floor" &&
				dispatch !== undefined
			) {
				dispatch(
					Action.EditorFloorInteractionFinished({
						originalFloorPlan: interaction.floorPlan,
						originOffset: interaction.originOffset,
					}),
				);
			}
		});
		window.addEventListener("pointercancel", () => {
			const interaction = activeInteraction;
			const dispatch = currentDispatch;
			activeInteraction = undefined;
			refreshCreatePreview();
			if (
				(interaction?.kind === "move" || interaction?.kind === "resize") &&
				dispatch !== undefined
			) {
				dispatch(
					Action.EditorEntityResized({
						entity: interaction.entity,
						position: interaction.position,
						body: interaction.body,
					}),
				);
			} else if (
				interaction?.kind === "resize-floor" &&
				dispatch !== undefined
			) {
				dispatch(
					Action.EditorFloorResized({
						floorPlan: interaction.floorPlan,
						originDelta: {
							x: -interaction.originOffset.x,
							y: -interaction.originOffset.y,
						},
					}),
				);
			}
		});
		window.addEventListener(
			"wheel",
			(event) => {
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
			},
			{ passive: false },
		);
		window.addEventListener("keydown", (event) => {
			const world = currentWorld;
			const dispatch = currentDispatch;
			if (world?.editor.open !== true || dispatch === undefined) return;
			if (world.editor.invalidPlacement !== null) {
				if (event.key === "Enter" || event.key === "Escape") {
					event.preventDefault();
					dispatch(Action.EditorInvalidPlacementDismissed());
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
				dispatch(Action.EditorToggled());
			}
		});

		const selectionTemplate = (
			world: World,
			invalidPreview: boolean,
		): TemplateResult => {
			const selected = world.editor.selected;
			if (selected === null) return svg``;
			const accent = invalidPreview ? "#e59a91" : "#fff0a8";
			if (selected === "floor") {
				const outline = projectedRectangle(
					{ x: world.floorPlan.width / 2, y: world.floorPlan.depth / 2 },
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
					<polygon points=${points(outline)} fill="none" stroke=${accent} stroke-width="5" stroke-dasharray="13 9" vector-effect="non-scaling-stroke" />
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
								)}
						/>`,
				)}
			`;
		};

		const numberInput = (
			label: string,
			value: number,
			minimum: number,
			maximum: number,
			onChange: (value: number) => void,
		): TemplateResult => html`
			<label class="block min-w-0 flex-1 text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
				${label}
				<input
					type="number"
					.value=${String(Math.round(value))}
					min=${minimum}
					max=${maximum}
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
				<aside data-editor-panel class="absolute top-0 right-0 z-30 flex h-full w-85 flex-col overscroll-contain border-l border-[#41565a] bg-[#0d181f]/98 text-[#fff1d6] shadow-[-18px_0_44px_rgba(3,9,12,0.38)]">
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
													maximumFloorExtent,
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
													maximumFloorExtent,
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

						<section class="mt-6 border-t border-[#30434a] pt-5">
							<button
								type="button"
								aria-label=${world.tireTracksEnabled ? "Disable mud wheels" : "Enable mud wheels"}
								aria-pressed=${String(world.tireTracksEnabled)}
								class="mt-3 flex w-full items-center justify-between rounded-xl border border-[#819993]/70 bg-[#17272e] py-2 pr-2 pl-3 text-left text-[11px] font-bold tracking-[0.12em] text-[#fff1d6] transition-colors hover:border-[#e8b875] hover:bg-[#20343b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff1d6]"
								@click=${() => dispatch(Action.TireTracksToggled())}
							>
								<span class="uppercase">Mud wheels</span>
								<span
									aria-hidden="true"
									class=${`relative h-6 w-11 rounded-full border shadow-inner transition-colors ${world.tireTracksEnabled ? "border-[#f3cc86] bg-[#c6833f]" : "border-[#526970] bg-[#253940]"}`}
								>
									<span
										class=${`absolute top-1/2 left-px h-5 w-5 -translate-y-1/2 rounded-full bg-[#fff1d6] shadow-[0_1px_3px_rgba(3,9,12,0.55)] transition-transform ${world.tireTracksEnabled ? "translate-x-5" : "translate-x-0"}`}
									></span>
								</span>
							</button>
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
				invalidPlacement?.kind === "floor"
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
							<button type="button" autofocus class="rounded-lg border border-[#9a625d] bg-[#6f3f3e] px-5 py-2 text-[11px] font-bold tracking-[0.12em] text-[#fff1ed] transition hover:bg-[#80504d]" @click=${() => dispatch(Action.EditorInvalidPlacementDismissed())}>OK</button>
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

		const renderWorld = (world: World, dispatch: Dispatch): void => {
			currentWorld = world;
			currentDispatch = dispatch;
			if (world.editor.invalidPlacement !== null) activeInteraction = undefined;
			const playerPosition = world.positions.get(playerEntity);
			const playerElevation = world.elevations.get(playerEntity);
			if (playerPosition === undefined || playerElevation === undefined) return;
			const playerSurface = surfaceAt(
				world,
				playerPosition,
				playerBody,
				playerElevation.z,
			);

			const camera = world.editor.open ? world.editor.camera : world.gameCamera;
			const invalidPreview = activePlacementIsInvalid(world);
			const floor = projectedRectangle(
				{ x: world.floorPlan.width / 2, y: world.floorPlan.depth / 2 },
				world.floorPlan,
			);
			const gridLines = interiorGridCoordinates(
				world.floorPlan.width,
				floorGridSpacing.x,
			).map(
				(x) =>
					svg`<line x1=${project({ x, y: 0 }).x} y1=${project({ x, y: 0 }).y} x2=${project({ x, y: world.floorPlan.depth }).x} y2=${project({ x, y: world.floorPlan.depth }).y} />`,
			);
			const depthLines = interiorGridCoordinates(
				world.floorPlan.depth,
				floorGridSpacing.y,
			).map(
				(y) =>
					svg`<line x1=${project({ x: 0, y }).x} y1=${project({ x: 0, y }).y} x2=${project({ x: world.floorPlan.width, y }).x} y2=${project({ x: world.floorPlan.width, y }).y} />`,
			);

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
				const trailPoints: Array<PlayerTrailMark> = world.tireTracksEnabled
					? [...world.playerTrail]
					: [];
				const lastPoint = trailPoints.at(-1);
				if (lastPoint !== undefined) {
					const playerDistance = Math.hypot(
						playerPosition.x - lastPoint.position.x,
						playerPosition.y - lastPoint.position.y,
					);
					if (
						playerDistance > 0.1 &&
						playerDistance <= playerTrailMarkSpacing * 2 &&
						playerElevation.velocity === stationaryVelocity &&
						playerElevation.z === playerSurface &&
						Math.abs(lastPoint.elevation - playerSurface) <=
							obstacleHeightTolerance
					) {
						trailPoints.push({
							position: playerPosition,
							elevation: playerSurface,
							supportEntity: supportSurfaceAt(
								world,
								playerPosition,
								playerBody,
								playerElevation.z,
							).entity,
							facing: world.playerFacing,
							age: lastPoint.age,
						});
					}
				}
				const marksAreConnected = (
					start: PlayerTrailMark | undefined,
					end: PlayerTrailMark | undefined,
				): boolean =>
					start !== undefined &&
					end !== undefined &&
					Math.hypot(
						end.position.x - start.position.x,
						end.position.y - start.position.y,
					) <=
						playerTrailMarkSpacing * 2 &&
					Math.abs(end.elevation - start.elevation) <= obstacleHeightTolerance;
				const trailContexts = trailPoints.map((mark, index) => {
					const candidatePrevious = trailPoints[index - 1];
					const candidateNext = trailPoints[index + 1];
					const previous = marksAreConnected(candidatePrevious, mark)
						? candidatePrevious
						: undefined;
					const next = marksAreConnected(mark, candidateNext)
						? candidateNext
						: undefined;
					return {
						mark,
						previous,
						next,
						turning: playerTireTrackIsTurning(previous, mark, next),
					};
				});
				const minimumTreadSpacing = 9;
				for (let index = 0; index < trailContexts.length; index++) {
					const context = trailContexts[index];
					if (context === undefined) continue;
					const clipOutline = playerTireTrackSurfaceOutline(
						world,
						context.mark,
					);
					if (clipOutline === undefined) continue;
					for (const side of ["left", "right"] as const) {
						const center = playerTireTrackCenter(
							context.previous,
							context.mark,
							context.next,
							side,
						);
						const adjacentTurnIsTooClose = (
							adjacent: (typeof trailContexts)[number] | undefined,
						): boolean => {
							if (context.turning || adjacent?.turning !== true) return false;
							const adjacentCenter = playerTireTrackCenter(
								adjacent.previous,
								adjacent.mark,
								adjacent.next,
								side,
							);
							return (
								Math.hypot(
									center.x - adjacentCenter.x,
									center.y - adjacentCenter.y,
								) < minimumTreadSpacing
							);
						};
						if (
							adjacentTurnIsTooClose(trailContexts[index - 1]) ||
							adjacentTurnIsTooClose(trailContexts[index + 1])
						)
							continue;
						objects.push({
							depth: renderDepthForSurfacePoint(
								world,
								context.mark.position,
								context.mark.elevation,
							),
							template: playerTireTrackTreadTemplate(
								context.previous,
								context.mark,
								context.next,
								{
									outline: clipOutline,
								},
								side,
							),
						});
					}
				}
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
					<main class=${`relative h-screen w-screen overflow-hidden bg-[#14212a] ${activeInteraction?.kind === "create" ? "editor-create-drag" : ""} ${invalidPreview ? "editor-invalid-preview-root" : ""}`}>
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
							</defs>
							${world.editor.open ? svg`<rect width="100%" height="100%" fill="url(#editor-dots)" opacity="0.68" />` : svg``}
							<g transform=${`translate(${camera.x} ${camera.y})`}>
								<polygon points=${points(floor)} fill="#c9b385" @pointerdown=${floorPointerDown} />
								<g pointer-events="none" stroke="#8f8065" stroke-width=${floorGridStrokeWidth} opacity=${floorGridOpacity}>${gridLines}${depthLines}</g>
								${objects.map(({ entity, template }) =>
									entity === undefined
										? template
										: svg`<g class=${world.editor.open ? "cursor-move" : ""} @pointerdown=${(event: PointerEvent) => startEntityMove(event, world, entity, dispatch)}>${template}</g>`,
								)}
								${world.editor.open ? selectionTemplate(world, invalidPreview) : svg``}
							</g>
						</svg>

						<h1 class="pointer-events-none absolute top-7 left-7 m-0 select-none text-[27px] font-heading font-bold tracking-[0.16em] text-[#fff1d6]">SAISHUMIN</h1>
						<div
							class=${`absolute top-6 z-40 flex flex-col items-end gap-2 ${world.editor.open ? "right-[360px]" : "right-6"}`}
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
								? html`<div class="pointer-events-none absolute bottom-6 left-7 rounded-xl bg-[#0d181f]/88 px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-[#e8b875]">CONTROLS PAUSED · INFINITE PAN · FIXED SCALE</div>${editorPanelTemplate(world, dispatch)}`
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
						${world.editor.invalidPlacement === null ? html`` : invalidPlacementTemplate(world, dispatch)}
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
			main?.classList.toggle("editor-create-drag", creating);
			main?.classList.toggle("editor-invalid-preview-root", invalid);
			document
				.querySelector("#world-canvas")
				?.classList.toggle("editor-invalid-preview", invalid);
			render(creating ? createPreviewTemplate(world, invalid) : html``, host);
		};
		return { render: renderWorld };
	});
}
