import { dual } from "effect/Function";
import { projectedRectangle } from "../../presentation/geometry/projection";
import type { Position } from "../../world/components";
import {
	entityBaseElevation,
	entityHeight,
} from "../../world/spatial/elevation";
import { isPlayerEntity, type World } from "../../world/world";
import type { DesignStudioItemKind } from "../model";

export type ScreenBounds = {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
};

export type ViewportSize = { readonly width: number; readonly height: number };

type PalettePress = {
	readonly itemKind: DesignStudioItemKind;
	readonly pointer: Position;
	readonly itemBounds: ScreenBounds;
};

export type PaletteGuidancePopover = {
	readonly itemBounds: ScreenBounds;
	readonly shownAt: number;
};

export type DesignStudioInteraction = {
	readonly palettePress: PalettePress | null;
	readonly popover: PaletteGuidancePopover | null;
};

export const initialDesignStudioInteraction: DesignStudioInteraction = {
	palettePress: null,
	popover: null,
};

export const isDesignStudioPanelVisible = (world: World): boolean =>
	world.editor.editSession === null;

export const pressPaletteItem = dual<
	(
		press: PalettePress,
	) => (self: DesignStudioInteraction) => DesignStudioInteraction,
	(
		self: DesignStudioInteraction,
		press: PalettePress,
	) => DesignStudioInteraction
>(
	2,
	(
		state: DesignStudioInteraction,
		press: PalettePress,
	): DesignStudioInteraction => ({
		...state,
		palettePress: press,
		popover: null,
	}),
);

const paletteActivationMargin = 12;

const isInsideActivationBounds = (
	pointer: Position,
	bounds: ScreenBounds,
): boolean =>
	pointer.x >= bounds.left - paletteActivationMargin &&
	pointer.x <= bounds.right + paletteActivationMargin &&
	pointer.y >= bounds.top - paletteActivationMargin &&
	pointer.y <= bounds.bottom + paletteActivationMargin;

type PalettePressMovement = {
	readonly state: DesignStudioInteraction;
	readonly activated: {
		readonly itemKind: DesignStudioItemKind;
		readonly pointer: Position;
	} | null;
};

export const movePalettePress = dual<
	(
		pointer: Position,
	) => (self: DesignStudioInteraction) => PalettePressMovement,
	(self: DesignStudioInteraction, pointer: Position) => PalettePressMovement
>(
	2,
	(state: DesignStudioInteraction, pointer: Position): PalettePressMovement => {
		const press = state.palettePress;
		if (press === null || isInsideActivationBounds(pointer, press.itemBounds))
			return { state, activated: null };
		return {
			state: { ...state, palettePress: null, popover: null },
			activated: { itemKind: press.itemKind, pointer },
		};
	},
);

export const releasePalettePress = dual<
	(time: number) => (self: DesignStudioInteraction) => DesignStudioInteraction,
	(self: DesignStudioInteraction, time: number) => DesignStudioInteraction
>(
	2,
	(state: DesignStudioInteraction, time: number): DesignStudioInteraction => {
		const press = state.palettePress;
		return press === null
			? state
			: {
					palettePress: null,
					popover: { itemBounds: press.itemBounds, shownAt: time },
				};
	},
);

const popoverVisibleMilliseconds = 3_000;
const popoverFadeMilliseconds = 200;

type VisiblePalettePopover = {
	readonly itemBounds: ScreenBounds;
	readonly opacity: number;
};

export const visiblePalettePopover = dual<
	(
		time: number,
	) => (self: DesignStudioInteraction) => VisiblePalettePopover | null,
	(self: DesignStudioInteraction, time: number) => VisiblePalettePopover | null
>(
	2,
	(
		state: DesignStudioInteraction,
		time: number,
	): VisiblePalettePopover | null => {
		const popover = state.popover;
		if (popover === null) return null;
		const elapsed = time - popover.shownAt;
		if (elapsed >= popoverVisibleMilliseconds) return null;
		const fadeStart = popoverVisibleMilliseconds - popoverFadeMilliseconds;
		return {
			itemBounds: popover.itemBounds,
			opacity:
				elapsed <= fadeStart
					? 1
					: (popoverVisibleMilliseconds - elapsed) / popoverFadeMilliseconds,
		};
	},
);

export const dismissPalettePopover = (
	state: DesignStudioInteraction,
): DesignStudioInteraction =>
	state.popover === null ? state : { ...state, popover: null };

const autoPanZone = 64;
const maximumAutoPanSpeed = 420;
const autoPanEnvelopePadding = 96;

const axisAutoPanSpeed = (pointer: number, extent: number): number => {
	if (pointer < autoPanZone)
		return maximumAutoPanSpeed * (1 - Math.max(0, pointer) / autoPanZone);
	const farZoneStart = extent - autoPanZone;
	if (pointer > farZoneStart)
		return (
			-maximumAutoPanSpeed *
			((Math.min(extent, pointer) - farZoneStart) / autoPanZone)
		);
	return 0;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(Math.max(value, minimum), maximum);

const clampedAutoPanAxis = (
	current: number,
	velocity: number,
	elapsedSeconds: number,
	scale: number,
	minimum: number,
	maximum: number,
): number => {
	if (velocity === 0) return current;
	const lowerBound = Math.min(minimum, maximum);
	const upperBound = Math.max(minimum, maximum);
	const delta = (velocity * elapsedSeconds) / scale;
	if (current < lowerBound)
		return delta <= 0 ? current : Math.min(current + delta, lowerBound);
	if (current > upperBound)
		return delta >= 0 ? current : Math.max(current + delta, upperBound);
	return clamp(current + delta, lowerBound, upperBound);
};

export const autoPanCamera = ({
	camera,
	pointer,
	viewport,
	scale = { x: 1, y: 1 },
	envelope,
	elapsedSeconds,
}: {
	readonly camera: Position;
	readonly pointer: Position;
	readonly viewport: ViewportSize;
	readonly scale?: Position;
	readonly envelope: ScreenBounds;
	readonly elapsedSeconds: number;
}): Position => {
	const scaleX = Math.max(Number.EPSILON, Math.abs(scale.x));
	const scaleY = Math.max(Number.EPSILON, Math.abs(scale.y));
	const viewportWidth = viewport.width / scaleX;
	const viewportHeight = viewport.height / scaleY;
	const horizontalPadding = autoPanEnvelopePadding / scaleX;
	const verticalPadding = autoPanEnvelopePadding / scaleY;
	const minimumX = viewportWidth - horizontalPadding - envelope.right;
	const maximumX = horizontalPadding - envelope.left;
	const minimumY = viewportHeight - verticalPadding - envelope.bottom;
	const maximumY = verticalPadding - envelope.top;
	return {
		x: clampedAutoPanAxis(
			camera.x,
			axisAutoPanSpeed(pointer.x, viewport.width),
			elapsedSeconds,
			scaleX,
			minimumX,
			maximumX,
		),
		y: clampedAutoPanAxis(
			camera.y,
			axisAutoPanSpeed(pointer.y, viewport.height),
			elapsedSeconds,
			scaleY,
			minimumY,
			maximumY,
		),
	};
};

export const floorResizePointerDelta = ({
	startPointer,
	screenPointer,
	camera,
}: {
	readonly startPointer: Position;
	readonly screenPointer: Position;
	readonly camera: Position;
}): Position => ({
	x: screenPointer.x - camera.x - startPointer.x,
	y: (screenPointer.y - camera.y - startPointer.y) / Math.SQRT1_2,
});

const boundsForPoints = (points: ReadonlyArray<Position>): ScreenBounds => ({
	left: Math.min(...points.map((point) => point.x)),
	top: Math.min(...points.map((point) => point.y)),
	right: Math.max(...points.map((point) => point.x)),
	bottom: Math.max(...points.map((point) => point.y)),
});

const unionBounds = (
	left: ScreenBounds,
	right: ScreenBounds,
): ScreenBounds => ({
	left: Math.min(left.left, right.left),
	top: Math.min(left.top, right.top),
	right: Math.max(left.right, right.right),
	bottom: Math.max(left.bottom, right.bottom),
});

export const contentEnvelope = (world: World): ScreenBounds => {
	let envelope = boundsForPoints(
		projectedRectangle(
			{
				x: world.floorOrigin.x + world.floorPlan.width / 2,
				y: world.floorOrigin.y + world.floorPlan.depth / 2,
			},
			world.floorPlan,
		),
	);
	for (const [entity, position] of world.positions) {
		if (isPlayerEntity(world, entity)) continue;
		const body = world.bodies.get(entity);
		if (body === undefined) continue;
		const base = entityBaseElevation(world, entity);
		envelope = unionBounds(
			envelope,
			boundsForPoints([
				...projectedRectangle(position, body, base),
				...projectedRectangle(
					position,
					body,
					base + entityHeight(world, entity),
				),
			]),
		);
	}
	return envelope;
};

export const contentEnvelopeIncludingPreview = ({
	world,
	previewWorld,
}: {
	readonly world: World;
	readonly previewWorld: World;
}): ScreenBounds =>
	unionBounds(contentEnvelope(world), contentEnvelope(previewWorld));
