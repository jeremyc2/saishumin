import { svg, type TemplateResult } from "lit-html";
import type { Action as AppAction } from "../../app/action";
import {
	points,
	projectedRectangle,
} from "../../rendering/geometry/projection";
import type { ResizeDirection } from "../../rendering/geometry/resize";
import type { Position } from "../../world/components";
import { entityBaseElevation } from "../../world/spatial/elevation";
import type { World } from "../../world/world";
import type { DesignStudioInteractionRuntime } from "../interaction/runtime";
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

export type DesignStudioView = ReturnType<typeof makeDesignStudioView>;

export const makeDesignStudioView = (
	interactionRuntime: DesignStudioInteractionRuntime,
) => {
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
							pointer-events="stroke"
							class=${edge.cursor}
							@pointerdown=${(event: PointerEvent) =>
								interactionRuntime.startFloorResize(
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
								interactionRuntime.startFloorResize(
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
							interactionRuntime.startEntityResize(
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
								interactionRuntime.startEntityResize(
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

	const { editorPanelTemplate } = makeDesignStudioPanel(interactionRuntime);

	const {
		invalidPlacementTemplate,
		signDialogTemplate,
		createPreviewTemplate,
		paletteGuidanceTemplate,
	} = makeDesignStudioOverlays(interactionRuntime);

	return {
		selectionTemplate,
		editorPanelTemplate,
		invalidPlacementTemplate,
		signDialogTemplate,
		createPreviewTemplate,
		paletteGuidanceTemplate,
	};
};
