import type { Body, Position } from "../model/component";

export type ResizeDirection = -1 | 0 | 1;

const resizeAxis = (
	center: number,
	extent: number,
	direction: ResizeDirection,
	delta: number,
	minimumExtent: number,
	maximumExtent: number,
): { readonly center: number; readonly extent: number } => {
	if (direction === 0) return { center, extent };
	const fixedEdge = center - (direction * extent) / 2;
	const draggedEdge = center + (direction * extent) / 2 + delta;
	const nextExtent = Math.min(
		maximumExtent,
		Math.max(minimumExtent, direction * (draggedEdge - fixedEdge)),
	);
	return {
		center: fixedEdge + (direction * nextExtent) / 2,
		extent: nextExtent,
	};
};

export const resizeFromHandle = (
	position: Position,
	body: Body,
	delta: Position,
	widthDirection: ResizeDirection,
	depthDirection: ResizeDirection,
	minimumBody: Body,
	maximumBody: Body,
): { readonly position: Position; readonly body: Body } => {
	const width = resizeAxis(
		position.x,
		body.width,
		widthDirection,
		delta.x,
		minimumBody.width,
		maximumBody.width,
	);
	const depth = resizeAxis(
		position.y,
		body.depth,
		depthDirection,
		delta.y,
		minimumBody.depth,
		maximumBody.depth,
	);
	return {
		position: { x: width.center, y: depth.center },
		body: { width: width.extent, depth: depth.extent },
	};
};
