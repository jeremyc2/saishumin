import { svg } from "lit-html";
import type { Action as AppAction } from "../../app/action";
import { plantVisualFootprintBody } from "../../presentation/artwork/visual-footprint";
import {
	points,
	projectedRectangle,
} from "../../presentation/geometry/projection";
import type { ResizeDirection } from "../../presentation/geometry/resize";
import { type LitTemplate, nothing } from "../../presentation/lit-template";
import { DecorationKinds, type Position } from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import { surfaceAt } from "../../world/spatial/collision";
import { entityBaseElevation } from "../../world/spatial/elevation";
import { characterSpawnPosition, type World } from "../../world/world";
import type { DesignStudioInteraction } from "../interaction/interaction";
import { touchResizeDirectionsForEvent } from "../interaction/pointer";
import { makeDesignStudioOverlays } from "./overlays";
import { makeDesignStudioPanel } from "./panel";

type Dispatch = (action: AppAction) => void;

const selectionHandleSize = 16;
const selectionDashPattern = "13 9";
const selectionDashPeriod = 22;
const midpoint = (start: Position, end: Position): Position => ({
	x: (start.x + end.x) / 2,
	y: (start.y + end.y) / 2,
});
const moveIndicatorArrowPath = (scale: number): string => {
	const extent = 28 * scale;
	const arrowhead = 8 * scale;
	return `M${-extent} 0H${extent}M${-extent} 0l${arrowhead} ${-arrowhead}M${-extent} 0l${arrowhead} ${arrowhead}M${extent} 0l${-arrowhead} ${-arrowhead}M${extent} 0l${-arrowhead} ${arrowhead}M0 ${-extent}V${extent}M0 ${-extent}l${-arrowhead} ${arrowhead}M0 ${-extent}l${arrowhead} ${arrowhead}M0 ${extent}l${-arrowhead} ${-arrowhead}M0 ${extent}l${arrowhead} ${-arrowhead}`;
};

export const editorEntitySelectionBody = ({
	world,
	entity,
}: {
	readonly world: World;
	readonly entity: EntityId;
}) => {
	const body = world.bodies.get(entity);
	if (body === undefined) return undefined;
	if (world.decorations.get(entity)?.kind === DecorationKinds.Plant)
		return plantVisualFootprintBody(body);
	return body;
};

export type DesignStudioView = ReturnType<typeof makeDesignStudioView>;

export const makeDesignStudioView = (interaction: DesignStudioInteraction) => {
	const selectionTemplate = (
		world: World,
		invalidPreview: boolean,
		dispatch: Dispatch,
	): LitTemplate => {
		const selected = world.editor.selected;
		if (selected === null) return nothing;
		const accent = invalidPreview ? "#e59a91" : "#fff0a8";
		const resizeTouchMode = interaction.touchEditorMode() === "resize";
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
						const startCoordinate = horizontal ? edge.start.x : edge.start.y;
						const endCoordinate = horizontal ? edge.end.x : edge.end.y;
						const start =
							startCoordinate <= endCoordinate ? edge.start : edge.end;
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
							vector-effect="non-scaling-stroke"
							pointer-events="stroke"
							class=${edge.cursor}
							@pointerdown=${(event: PointerEvent) =>
								interaction.startFloorResize(
									event,
									world,
									edge.widthDirection,
									edge.depthDirection,
									dispatch,
								)}
						/>`,
					)}
					${handles.map(
						(handle) => svg`<g>
						<rect
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
								interaction.startFloorResize(
									event,
									world,
									handle.widthDirection,
									handle.depthDirection,
									dispatch,
								)}
						/></g>`,
					)}
					${
						resizeTouchMode
							? svg`<polygon
								data-touch-resize-target
								points=${points(outline)}
								fill="none"
								stroke="#000"
								stroke-opacity="0.001"
								stroke-width="128"
								vector-effect="non-scaling-stroke"
								pointer-events="stroke"
								class="hidden any-pointer-coarse:block"
								@pointerdown=${(event: PointerEvent) => {
									const directions = touchResizeDirectionsForEvent({
										event,
										outline,
									});
									if (directions === null) return;
									interaction.startFloorResize(
										event,
										world,
										directions.widthDirection,
										directions.depthDirection,
										dispatch,
									);
								}}
							/>`
							: nothing
					}
				`;
		}

		const characterSelected = world.characters.has(selected);
		const position = characterSelected
			? characterSpawnPosition({ world, entity: selected })
			: world.positions.get(selected);
		const body = editorEntitySelectionBody({ world, entity: selected });
		if (position === undefined || body === undefined) return nothing;
		const outline = projectedRectangle(
			position,
			body,
			characterSelected
				? surfaceAt(world, position, body)
				: entityBaseElevation(world, selected),
		);
		const touchMoveTarget = resizeTouchMode
			? nothing
			: svg`<polygon
					data-touch-move-target
					points=${points(outline)}
					fill="transparent"
					stroke="transparent"
					stroke-width="128"
					vector-effect="non-scaling-stroke"
					pointer-events="all"
					class="hidden any-pointer-coarse:block"
					@pointerdown=${(event: PointerEvent) =>
						interaction.startEntityMove(event, world, selected, dispatch)}
				/>`;
		const selectionCenter = midpoint(outline[0], outline[2]);
		const moveIndicatorScale = 1 / interaction.zoom();
		const touchMovePresentation = resizeTouchMode
			? nothing
			: svg`
					<polygon
						data-touch-move-highlight
						points=${points(outline)}
						fill=${accent}
						fill-opacity="0.24"
						stroke=${accent}
						stroke-width="5"
						vector-effect="non-scaling-stroke"
						pointer-events="none"
						class="hidden any-pointer-coarse:block"
					/>
					<g
						data-touch-move-indicator
						transform=${`translate(${selectionCenter.x} ${selectionCenter.y})`}
						pointer-events="none"
						class="hidden any-pointer-coarse:block"
					>
						<circle r=${40 * moveIndicatorScale} fill=${accent} stroke="#503b37" stroke-width="4" vector-effect="non-scaling-stroke" />
						<path d=${moveIndicatorArrowPath(moveIndicatorScale)} fill="none" stroke="#503b37" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
					</g>
				`;
		if (characterSelected)
			return svg`<polygon points=${points(outline)} fill="none" stroke=${accent} stroke-width="4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" pointer-events="none" class=${resizeTouchMode ? "" : "any-pointer-coarse:hidden"} />${touchMovePresentation}${touchMoveTarget}`;
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
				<polygon points=${points(outline)} fill="none" stroke=${accent} stroke-width="4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" pointer-events="none" class=${resizeTouchMode ? "" : "any-pointer-coarse:hidden"} />
				${touchMovePresentation}
				${touchMoveTarget}
				${edges.map(
					(edge) => svg`<line
						x1=${edge.start.x}
						y1=${edge.start.y}
						x2=${edge.end.x}
						y2=${edge.end.y}
						stroke="transparent"
						stroke-width="18"
						vector-effect="non-scaling-stroke"
						pointer-events="stroke"
						class=${`${edge.cursor} ${resizeTouchMode ? "" : "any-pointer-coarse:hidden"}`}
						@pointerdown=${(event: PointerEvent) =>
							interaction.startEntityResize(
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
					(handle) => svg`<g>
						<rect
							data-selection-handle
							x=${handle.point.x - selectionHandleSize / 2}
							y=${handle.point.y - selectionHandleSize / 2}
							width=${selectionHandleSize}
							height=${selectionHandleSize}
							rx="3"
							fill=${accent}
							stroke="#503b37"
							stroke-width="3"
							class=${`${handle.cursor} ${resizeTouchMode ? "" : "any-pointer-coarse:hidden"}`}
							@pointerdown=${(event: PointerEvent) =>
								interaction.startEntityResize(
									event,
									world,
									selected,
									handle.widthDirection,
									handle.depthDirection,
									dispatch,
								)}
						/></g>`,
				)}
				${
					resizeTouchMode
						? svg`<polygon
							data-touch-resize-target
							points=${points(outline)}
							fill="none"
							stroke="#000"
							stroke-opacity="0.001"
							stroke-width="128"
							vector-effect="non-scaling-stroke"
							pointer-events="stroke"
							class="hidden any-pointer-coarse:block"
							@pointerdown=${(event: PointerEvent) => {
								const directions = touchResizeDirectionsForEvent({
									event,
									outline,
								});
								if (directions === null) return;
								interaction.startEntityResize(
									event,
									world,
									selected,
									directions.widthDirection,
									directions.depthDirection,
									dispatch,
								);
							}}
						/>`
						: nothing
				}
			`;
	};

	const { editorPanelTemplate } = makeDesignStudioPanel(interaction);

	const {
		invalidPlacementTemplate,
		signDialogTemplate,
		createPreviewTemplate,
		paletteGuidanceTemplate,
	} = makeDesignStudioOverlays(interaction);

	return {
		selectionTemplate,
		editorPanelTemplate,
		invalidPlacementTemplate,
		signDialogTemplate,
		createPreviewTemplate,
		paletteGuidanceTemplate,
	};
};
