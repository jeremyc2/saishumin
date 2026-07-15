import { svg, type TemplateResult } from "lit-html";
import type { ShadowSection } from "../ecs/elevation";
import {
	type Body,
	type Decoration,
	DecorationKinds,
	type Elevation,
	type Position,
} from "../model/component";
import type { PlayerFacing } from "../model/player-facing";
import {
	insetRectangle,
	points,
	project,
	projectedRectangle,
} from "./projection";

const boxOutlineWidth = 3;

const crateVisual = {
	topInsetWidth: 14,
	topInsetDepth: 18,
	topLift: 1,
	shadowDepthOffset: 7,
	panelTopInset: 9,
	panelBottomInset: 8,
	panelSideInset: 8,
	panelOutlineWidth: 2.5,
	panelCrossbarOffsets: [18, 36],
	panelCrossbarInset: 9,
	verticalStripWidth: 7,
	rightStripOffset: 15,
	nailSideInset: 12,
	nailTopInset: 8,
	nailBottomInset: 7,
	nailRadius: 2,
	shadowOpacity: 0.24,
	verticalStripOpacity: 0.7,
} as const;

const chestVisual = {
	topInsetWidth: 12,
	topInsetDepth: 12,
	lowerHeightRatio: 0.58,
	latchWidth: 14,
	latchHeight: 12,
	latchBottomInset: 10,
	lidTopOffset: 8,
} as const;

const playerShadowVisual = {
	minimumScale: 0.42,
	scaleDistance: 220,
	minimumOpacity: 0.12,
	maximumOpacity: 0.42,
	groundedOpacity: 0.24,
	opacityDistance: 360,
	airborneThreshold: 3,
	airborneOffset: 2,
	airborneRadius: { x: 27, y: 9 },
	groundedRadius: { x: 22, y: 5 },
} as const;

const playerSpriteBaseline = 38.5;
const playerFaceStrokeWidth = 3.8;
const playerWheelColor = "#874727";
const playerBodyClipId = "player-body-clip";

type PlayerView = "front" | "front-quarter" | "side" | "rear-quarter" | "back";

type PlayerDrawing = {
	readonly view: PlayerView;
	readonly mirror: boolean;
	readonly bodyPath: string;
};

const playerFrontBodyPath =
	"M -20 35 Q -27 8 -17 -10 Q 0 -30 17 -10 Q 27 8 20 35 Z";
const playerQuarterBodyPath =
	"M -17 35 Q -24 9 -13 -10 Q 2 -30 18 -9 Q 28 8 19 35 Z";
const playerSideBodyPath =
	"M -13 35 Q -21 12 -12 -9 Q -4 -27 12 -18 Q 23 -12 24 -2 Q 30 5 23 11 Q 25 24 18 35 Z";
const playerBackBodyPath =
	"M -21 35 Q -27 9 -18 -10 Q 0 -29 18 -10 Q 27 9 21 35 Z";

export const playerDrawingForFacing = (facing: PlayerFacing): PlayerDrawing => {
	switch (facing) {
		case "down":
			return { view: "front", mirror: false, bodyPath: playerFrontBodyPath };
		case "down-right":
			return {
				view: "front-quarter",
				mirror: false,
				bodyPath: playerQuarterBodyPath,
			};
		case "down-left":
			return {
				view: "front-quarter",
				mirror: true,
				bodyPath: playerQuarterBodyPath,
			};
		case "right":
			return { view: "side", mirror: false, bodyPath: playerSideBodyPath };
		case "left":
			return { view: "side", mirror: true, bodyPath: playerSideBodyPath };
		case "up-right":
			return {
				view: "rear-quarter",
				mirror: false,
				bodyPath: playerQuarterBodyPath,
			};
		case "up-left":
			return {
				view: "rear-quarter",
				mirror: true,
				bodyPath: playerQuarterBodyPath,
			};
		case "up":
			return { view: "back", mirror: false, bodyPath: playerBackBodyPath };
	}
};

export const crateShadowDepthOffset = (
	baseElevation: number,
	shadowElevation: number,
): number =>
	shadowElevation < baseElevation ? crateVisual.shadowDepthOffset : 0;

export const crateTopBoardDepthOffsets = (
	depth: number,
): readonly [number, number] => {
	const insetDepth = Math.max(4, depth - crateVisual.topInsetDepth);
	return [-insetDepth / 6, insetDepth / 6];
};

const playerWheelsTemplate = (view: PlayerView): TemplateResult => {
	if (view === "side")
		return svg`
			<ellipse cx="2.5" cy="39" rx="9" ry="7.5" fill=${playerWheelColor} />
		`;
	if (view === "front-quarter" || view === "rear-quarter")
		return svg`
			<ellipse cx="-6" cy="38" rx="7" ry="7" fill=${playerWheelColor} opacity="0.94" />
			<ellipse cx="8" cy="39" rx="7" ry="7.5" fill=${playerWheelColor} />
		`;
	return svg`
		<ellipse cx="-10" cy="39" rx="9" ry="7.5" fill=${playerWheelColor} />
		<ellipse cx="10" cy="39" rx="9" ry="7.5" fill=${playerWheelColor} />
	`;
};

const playerBodyInteriorTemplate = (view: PlayerView): TemplateResult => {
	if (view === "side")
		return svg`
			<path d="M -25 -19 H -3 V -11 H -6 V -2 H -9 V 10 H -12 V 24 H -16 V 40 H -25 Z" fill="#f9c267" />
			<path d="M 11 -20 H 30 V 40 H -25 V 33 H 4 V 28 H 9 V 20 H 13 V 12 H 17 V 5 H 21 V -2 H 18 V -11 H 11 Z" fill="#df8d3f" />
			<path d="M 18 -7 Q 27 0 22 10" fill="none" stroke="#cd7837" stroke-width="3" opacity="0.7" />
		`;
	if (view === "front-quarter")
		return svg`
			<path d="M -25 -18 H -2 V -11 H -5 V -3 H -8 V 7 H -11 V 18 H -14 V 31 H -18 V 40 H -25 Z" fill="#f9c267" />
			<path d="M 10 -18 H 28 V 40 H -25 V 33 H 3 V 28 H 7 V 21 H 10 V 13 H 13 V 4 H 15 V -5 H 13 Z" fill="#df8d3f" />
		`;
	if (view === "rear-quarter")
		return svg`
			<path d="M -25 -18 H -4 V -10 H -7 V 0 H -10 V 12 H -13 V 25 H -17 V 40 H -25 Z" fill="#f8bd60" />
			<path d="M 8 -18 H 28 V 40 H -25 V 34 H 2 V 29 H 7 V 21 H 10 V 12 H 13 V 2 H 14 V -7 H 11 Z" fill="#dc883d" />
			<path d="M 7 -15 Q 15 0 10 22" fill="none" stroke="#c97638" stroke-width="3.2" opacity="0.65" />
		`;
	if (view === "back")
		return svg`
			<path d="M -26 -18 H -4 V -11 H -7 V -2 H -10 V 9 H -13 V 21 H -17 V 40 H -26 Z" fill="#f8bd60" />
			<path d="M 12 -18 H 27 V 40 H -27 V 34 H 4 V 28 H 8 V 19 H 11 V 8 H 14 V -4 H 12 Z" fill="#dc883d" />
			<path d="M 0 -17 Q 6 -1 2 18 Q 1 27 4 35" fill="none" stroke="#d17e3a" stroke-width="3" opacity="0.48" />
		`;
	return svg`
		<path d="M -25 -18 H -3 V -12 H -6 V -5 H -9 V 4 H -12 V 13 H -15 V 23 H -18 V 38 H -25 Z" fill="#f9c267" />
		<rect x="-7" y="-9" width="3" height="3" fill="#f9c267" />
		<rect x="-10" y="1" width="3" height="3" fill="#f9c267" />
		<rect x="-13" y="11" width="3" height="3" fill="#f9c267" />
		<path d="M 14 -15 H 25 V 38 H -25 V 32 H 5 V 28 H 8 V 22 H 11 V 14 H 13 V 5 H 15 V -5 H 14 Z" fill="#df8d3f" />
		<rect x="7" y="25" width="3" height="3" fill="#df8d3f" />
		<rect x="10" y="17" width="3" height="3" fill="#df8d3f" />
		<rect x="12" y="8" width="3" height="3" fill="#df8d3f" />
	`;
};

const playerFaceTemplate = (
	view: PlayerView,
	handlingObject: boolean,
): TemplateResult => {
	if (view === "back")
		return svg`<path d="M -7 -8 Q 0 -13 7 -8" fill="none" stroke="#ce7939" stroke-width="3" stroke-linecap="round" opacity="0.56" />`;
	if (view === "rear-quarter")
		return svg`
			<ellipse cx="14" cy="-2" rx=${handlingObject ? 3.4 : 3.1} ry=${handlingObject ? 1.5 : 1.9} fill="#382c31" transform="rotate(18 14 -2)" />
			<path d="M 17 7 Q 21 9 20 13" fill="none" stroke="#503b37" stroke-width="2.8" stroke-linecap="round" />
		`;
	if (view === "side")
		return svg`
			<ellipse cx="11" cy="-3" rx="4.6" ry=${handlingObject ? 1.9 : 2.4} fill="#382c31" transform="rotate(10 11 -3)" />
		${
			handlingObject
				? svg`<path d="M 12 9 C 17 7 21 9 21 13 C 18 16 15 17 12 15 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />`
				: svg`<path d="M 11 13 Q 17 8 21 12 Q 17 15 11 13 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />`
		}
		`;
	if (view === "front-quarter")
		return svg`
			<ellipse cx="-2" cy="-3" rx="3.5" ry=${handlingObject ? 1.8 : 2.1} fill="#382c31" transform="rotate(-8 -2 -3)" />
			<ellipse cx="11" cy="-2" rx="4.8" ry=${handlingObject ? 2 : 2.4} fill="#382c31" transform="rotate(15 11 -2)" />
			${
				handlingObject
					? svg`<path d="M -2 9 C 3 7 12 8 16 11 C 15 15 11 18 6 18 C 2 17 -1 14 -2 9 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />`
					: svg`<path d="M -3 14 Q 7 6 16 12 Q 8 16 -3 14 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />`
			}
		`;
	if (handlingObject)
		return svg`
			<ellipse cx="-8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" />
			<ellipse cx="8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" />
			<path d="M -9.5 9 C -5.5 7.3 5.5 7.3 9.5 9 C 8.8 14.2 5.1 17.6 0 18 C -5.1 17.6 -8.8 14.2 -9.5 9 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />
		`;
	return svg`
		<ellipse cx="-8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" transform="rotate(-13 -8 -3)" />
		<ellipse cx="8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" transform="rotate(13 8 -3)" />
		<path d="M -10.5 14 Q 0 5.3 10.5 14 Q 0 16.7 -10.5 14 Z" fill="#fffaf0" stroke="#382c31" stroke-width=${playerFaceStrokeWidth} stroke-linejoin="round" />
	`;
};

export const boxTemplate = (
	position: Position,
	body: Body,
	height: number,
	colors: {
		readonly top: string;
		readonly front: string;
		readonly edge?: string;
	},
	className = "",
	baseElevation = 0,
): TemplateResult => {
	const bottom = projectedRectangle(position, body, baseElevation);
	const top = projectedRectangle(position, body, baseElevation + height);
	const edge = colors.edge ?? "#263942";
	return svg`
		<g class=${className} stroke-linejoin="round">
			<polygon points=${points([bottom[3], bottom[2], top[2], top[3]])} fill=${colors.front} stroke=${edge} stroke-width=${boxOutlineWidth} />
			<polygon points=${points(top)} fill=${colors.top} stroke=${edge} stroke-width=${boxOutlineWidth} />
		</g>
	`;
};

export const crateTemplate = (
	position: Position,
	body: Body,
	height: number,
	grabbed: boolean,
	baseElevation = 0,
	shadowSections: ReadonlyArray<ShadowSection> = [
		{ position, body, elevation: baseElevation },
	],
): TemplateResult => {
	const top = projectedRectangle(position, body, baseElevation + height);
	const topInset = projectedRectangle(
		position,
		{
			width: Math.max(4, body.width - crateVisual.topInsetWidth),
			depth: Math.max(4, body.depth - crateVisual.topInsetDepth),
		},
		baseElevation + height + crateVisual.topLift,
	);
	const frontTop = project(
		{ x: position.x, y: position.y + body.depth / 2 },
		baseElevation + height,
	);
	const frontBottom = project(
		{ x: position.x, y: position.y + body.depth / 2 },
		baseElevation,
	);
	const left = frontTop.x - body.width / 2;
	const right = frontTop.x + body.width / 2;
	const panelTop = frontTop.y + crateVisual.panelTopInset;
	const panelBottom = frontBottom.y - crateVisual.panelBottomInset;
	const edge = grabbed ? "#fff0a8" : "#633d2f";
	const outerOutline = insetRectangle(
		[
			top[0],
			top[1],
			{ x: right, y: frontBottom.y },
			{ x: left, y: frontBottom.y },
		],
		boxOutlineWidth / 2,
	);
	return svg`
		${shadowSections.map(
			(section) =>
				svg`<polygon points=${points(
					projectedRectangle(
						{
							x: section.position.x,
							y:
								section.position.y +
								crateShadowDepthOffset(baseElevation, section.elevation),
						},
						section.body,
						section.elevation,
					),
				)} fill="#14212a" opacity=${crateVisual.shadowOpacity} />`,
		)}
		<polygon points=${points([
			{ x: left, y: frontBottom.y },
			{ x: right, y: frontBottom.y },
			{ x: right, y: frontTop.y },
			{ x: left, y: frontTop.y },
		])} fill="#945936" />
		<polygon points=${points(top)} fill="#d6a15d" />
		<polygon points=${points(topInset)} fill="#c48349" stroke="#70452f" stroke-width="2" stroke-linejoin="round" />
		${crateTopBoardDepthOffsets(body.depth).map((depthOffset) => {
			const y = project(
				{ x: position.x, y: position.y + depthOffset },
				baseElevation + height + crateVisual.topLift,
			).y;
			return svg`<line x1=${topInset[0].x} y1=${y} x2=${topInset[1].x} y2=${y} stroke="#8c5738" stroke-width="2" />`;
		})}
		<rect x=${left + crateVisual.panelSideInset} y=${panelTop} width=${Math.max(2, body.width - crateVisual.panelSideInset * 2)} height=${Math.max(2, panelBottom - panelTop)} fill="#b87442" stroke="#70452f" stroke-width=${crateVisual.panelOutlineWidth} />
		${crateVisual.panelCrossbarOffsets.map((offset) => svg`<line x1=${left + crateVisual.panelCrossbarInset} y1=${panelTop + offset} x2=${right - crateVisual.panelCrossbarInset} y2=${panelTop + offset} stroke="#865033" stroke-width=${boxOutlineWidth} />`)}
		<rect x=${left + crateVisual.panelSideInset} y=${panelTop} width=${crateVisual.verticalStripWidth} height=${panelBottom - panelTop} fill="#8e5636" opacity=${crateVisual.verticalStripOpacity} />
		<rect x=${right - crateVisual.rightStripOffset} y=${panelTop} width=${crateVisual.verticalStripWidth} height=${panelBottom - panelTop} fill="#8e5636" opacity=${crateVisual.verticalStripOpacity} />
		<circle cx=${left + crateVisual.nailSideInset} cy=${panelTop + crateVisual.nailTopInset} r=${crateVisual.nailRadius} fill="#5b4035" />
		<circle cx=${right - crateVisual.nailSideInset} cy=${panelTop + crateVisual.nailTopInset} r=${crateVisual.nailRadius} fill="#5b4035" />
		<circle cx=${left + crateVisual.nailSideInset} cy=${panelBottom - crateVisual.nailBottomInset} r=${crateVisual.nailRadius} fill="#5b4035" />
		<circle cx=${right - crateVisual.nailSideInset} cy=${panelBottom - crateVisual.nailBottomInset} r=${crateVisual.nailRadius} fill="#5b4035" />
		<line x1=${outerOutline[0].x} y1=${frontTop.y} x2=${outerOutline[1].x} y2=${frontTop.y} stroke=${edge} stroke-width=${boxOutlineWidth} />
		<polygon points=${points(outerOutline)} fill="none" stroke=${edge} stroke-width=${boxOutlineWidth} stroke-linejoin="round" />
	`;
};

const chestShadowTemplate = (
	position: Position,
	body: Body,
	baseElevation: number,
): TemplateResult =>
	svg`<polygon points=${points(projectedRectangle(position, body, baseElevation))} fill="#14212a" opacity="0.22" />`;

const chestFront = (
	position: Position,
	body: Body,
	baseElevation: number,
	height: number,
): {
	readonly top: ReadonlyArray<Position>;
	readonly frontTop: Position;
	readonly frontBottom: Position;
	readonly left: number;
	readonly right: number;
} => {
	const top = projectedRectangle(position, body, baseElevation + height);
	const frontTop = project(
		{ x: position.x, y: position.y + body.depth / 2 },
		baseElevation + height,
	);
	const frontBottom = project(
		{ x: position.x, y: position.y + body.depth / 2 },
		baseElevation,
	);
	return {
		top,
		frontTop,
		frontBottom,
		left: frontTop.x - body.width / 2,
		right: frontTop.x + body.width / 2,
	};
};

const chestFrontTemplate = (
	front: ReturnType<typeof chestFront>,
): TemplateResult => {
	const latchX = (front.left + front.right - chestVisual.latchWidth) / 2;
	const latchY =
		front.frontBottom.y -
		chestVisual.latchHeight -
		chestVisual.latchBottomInset;
	return svg`
		<polygon points=${points([
			{ x: front.left, y: front.frontBottom.y },
			{ x: front.right, y: front.frontBottom.y },
			{ x: front.right, y: front.frontTop.y },
			{ x: front.left, y: front.frontTop.y },
		])} fill="#855036" stroke="#432f2c" stroke-width=${boxOutlineWidth} stroke-linejoin="round" />
		<rect x=${front.left + 7} y=${front.frontTop.y + 8} width=${Math.max(2, front.right - front.left - 14)} height=${Math.max(2, front.frontBottom.y - front.frontTop.y - 15)} fill="none" stroke="#b97848" stroke-width="3" />
		<rect x=${latchX} y=${latchY} width=${chestVisual.latchWidth} height=${chestVisual.latchHeight} rx="2" fill="#d9b55f" stroke="#52382d" stroke-width="2" />
	`;
};

export const closedChestTemplate = (
	position: Position,
	body: Body,
	height: number,
	baseElevation = 0,
): TemplateResult => {
	const front = chestFront(position, body, baseElevation, height);
	const topInset = projectedRectangle(
		position,
		{
			width: Math.max(4, body.width - chestVisual.topInsetWidth),
			depth: Math.max(4, body.depth - chestVisual.topInsetDepth),
		},
		baseElevation + height + chestVisual.lidTopOffset,
	);
	return svg`
		<g data-chest-state="closed">
			${chestShadowTemplate(position, body, baseElevation)}
			${chestFrontTemplate(front)}
			<polygon points=${points(front.top)} fill="#b97647" stroke="#432f2c" stroke-width=${boxOutlineWidth} stroke-linejoin="round" />
			<polygon points=${points(topInset)} fill="#d59a57" stroke="#6a4230" stroke-width="2" stroke-linejoin="round" />
			<line x1=${topInset[0].x} y1=${topInset[0].y} x2=${topInset[1].x} y2=${topInset[1].y} stroke="#f0bf72" stroke-width="2" opacity="0.62" />
		</g>
	`;
};

export const openChestTemplate = (
	position: Position,
	body: Body,
	height: number,
	baseElevation = 0,
): TemplateResult => {
	const lowerHeight = Math.max(20, height * chestVisual.lowerHeightRatio);
	const front = chestFront(position, body, baseElevation, lowerHeight);
	const hinge = project(
		{ x: position.x, y: position.y - body.depth / 2 },
		baseElevation + lowerHeight,
	);
	const lidTop = project(
		{ x: position.x, y: position.y - body.depth / 2 },
		baseElevation + height + chestVisual.lidTopOffset,
	);
	return svg`
		<g data-chest-state="open">
			${chestShadowTemplate(position, body, baseElevation)}
			${chestFrontTemplate(front)}
			<polygon points=${points(front.top)} fill="#5a392f" stroke="#432f2c" stroke-width=${boxOutlineWidth} stroke-linejoin="round" />
			<polygon points=${points([
				{ x: hinge.x - body.width / 2, y: hinge.y },
				{ x: hinge.x + body.width / 2, y: hinge.y },
				{ x: lidTop.x + body.width / 2, y: lidTop.y },
				{ x: lidTop.x - body.width / 2, y: lidTop.y },
			])} fill="#c9874e" stroke="#432f2c" stroke-width=${boxOutlineWidth} stroke-linejoin="round" />
			<line x1=${lidTop.x - body.width / 2 + 8} y1=${lidTop.y + 8} x2=${lidTop.x + body.width / 2 - 8} y2=${lidTop.y + 8} stroke="#f0bf72" stroke-width="2" opacity="0.68" />
		</g>
	`;
};

export const chestTemplate = (
	position: Position,
	body: Body,
	height: number,
	opened: boolean,
	baseElevation = 0,
): TemplateResult =>
	opened
		? openChestTemplate(position, body, height, baseElevation)
		: closedChestTemplate(position, body, height, baseElevation);

export const signpostTemplate = (
	position: Position,
	body: Body,
	height: number,
	baseElevation = 0,
): TemplateResult => {
	const base = project(position, baseElevation);
	const scale = Math.max(0.6, Math.min(2.4, (body.width + body.depth) / 140));
	const heightScale = height / 104;
	return svg`
		<g data-decoration-kind="sign" transform=${`translate(${base.x} ${base.y}) scale(${scale} ${heightScale})`}>
			<ellipse cx="0" cy="4" rx="29" ry="8" fill="#14212a" opacity="0.22" />
			<path d="M -7 2 L 7 2 L 6 -58 L -6 -58 Z" fill="#6b432a" stroke="#3f2a23" stroke-width="3" stroke-linejoin="round" />
			<path d="M -37 -89 L 37 -89 L 33 -49 L -33 -49 Z" fill="#b77a42" stroke="#3f2a23" stroke-width="4" stroke-linejoin="round" />
			<path d="M -29 -80 H 29 M -29 -69 H 29" stroke="#d89c5d" stroke-width="3" stroke-linecap="round" opacity="0.74" />
			<circle cx="-25" cy="-69" r="2.5" fill="#4c3026" />
			<circle cx="25" cy="-69" r="2.5" fill="#4c3026" />
		</g>
	`;
};

export const decorationTemplate = (
	position: Position,
	body: Body,
	decoration: Decoration,
	baseElevation = 0,
	grabbed = false,
): TemplateResult => {
	if (decoration.kind === DecorationKinds.Rug) {
		const borderWidth = Math.max(4, Math.min(12, body.width / 28));
		return svg`<polygon points=${points(projectedRectangle(position, body))} fill="#cf8677" stroke="#e8b875" stroke-width=${borderWidth} />`;
	}

	const base = project(position, baseElevation);
	const scale = Math.max(0.55, Math.min(2.6, (body.width + body.depth) / 140));
	if (decoration.kind === DecorationKinds.Sign)
		return signpostTemplate(position, body, decoration.height, baseElevation);

	const heightScale =
		decoration.kind === DecorationKinds.Plant
			? decoration.height / 84
			: decoration.height / 96;
	const grabbedEdge = "#fff0a8";
	if (decoration.kind === DecorationKinds.Plant) {
		const leafEdge = grabbed ? grabbedEdge : "#294c3c";
		const potEdge = grabbed ? grabbedEdge : "#563f38";
		return svg`
			<g transform=${`translate(${base.x} ${base.y}) scale(${scale} ${heightScale})`}>
				<ellipse cx="0" cy="3" rx="26" ry="9" fill="#14212a" opacity="0.2" />
				<path d="M -18 -29 Q -26 -58 -8 -66 Q -2 -44 0 -24" fill="#52785d" stroke=${leafEdge} stroke-width="3" />
				<path d="M 4 -25 Q 7 -64 27 -59 Q 25 -37 10 -20" fill="#6d9568" stroke=${leafEdge} stroke-width="3" />
				<path d="M -3 -23 Q -5 -74 12 -78 Q 20 -50 7 -19" fill="#88aa73" stroke=${leafEdge} stroke-width="3" />
				<path d="M -20 -27 L 20 -27 L 15 1 Q 0 10 -15 1 Z" fill="#bb7148" stroke=${potEdge} stroke-width="4" />
				<path d="M -23 -30 L 23 -30 L 20 -20 L -20 -20 Z" fill="#d58a55" stroke=${potEdge} stroke-width="4" />
			</g>
		`;
	}

	const lampEdge = grabbed ? grabbedEdge : "#352f31";
	const lampStandEdge = grabbed ? grabbedEdge : "#67594d";
	const shadeEdge = grabbed ? grabbedEdge : "#59483f";
	return svg`
		<g transform=${`translate(${base.x} ${base.y}) scale(${scale} ${heightScale})`}>
			<ellipse cx="0" cy="3" rx="22" ry="7" fill="#14212a" opacity="0.2" />
			<path d="M -13 0 L 13 0 L 8 -8 L -8 -8 Z" fill="#66483a" stroke=${lampEdge} stroke-width="3" />
			<path d="M 0 -8 L 0 -60" stroke=${lampStandEdge} stroke-width="7" stroke-linecap="round" />
			<path d="M -25 -73 Q 0 -91 25 -73 L 17 -50 L -17 -50 Z" fill="#f1c96f" stroke=${shadeEdge} stroke-width="4" />
			<ellipse cx="0" cy="-57" rx="12" ry="6" fill="#fff2b2" opacity="0.72" />
		</g>
	`;
};

export const playerTemplate = (
	position: Position,
	elevation: Elevation,
	shadowHeight: number,
	facing: PlayerFacing,
	handlingObject = false,
): TemplateResult => {
	const shadow = project(position, shadowHeight);
	const wheelContact = project(position, elevation.z);
	const shadowDistance = Math.max(0, elevation.z - shadowHeight);
	const shadowScale = Math.max(
		playerShadowVisual.minimumScale,
		1 - shadowDistance / playerShadowVisual.scaleDistance,
	);
	const shadowOpacity = Math.max(
		playerShadowVisual.minimumOpacity,
		playerShadowVisual.maximumOpacity -
			shadowDistance / playerShadowVisual.opacityDistance,
	);
	const hasSurface = Number.isFinite(shadowHeight);
	const isAirborne =
		hasSurface && shadowDistance > playerShadowVisual.airborneThreshold;
	const drawing = playerDrawingForFacing(facing);
	return svg`
		${
			isAirborne
				? svg`<ellipse cx=${shadow.x} cy=${shadow.y + playerShadowVisual.airborneOffset} rx=${playerShadowVisual.airborneRadius.x * shadowScale} ry=${playerShadowVisual.airborneRadius.y * shadowScale} fill="#14212a" opacity=${shadowOpacity} />`
				: hasSurface
					? svg`<ellipse cx=${wheelContact.x} cy=${wheelContact.y} rx=${playerShadowVisual.groundedRadius.x} ry=${playerShadowVisual.groundedRadius.y} fill="#14212a" opacity=${playerShadowVisual.groundedOpacity} />`
					: svg``
		}
		<g
			data-player-expression=${handlingObject ? "handling" : "neutral"}
			data-player-facing=${facing}
			data-player-view=${drawing.view}
			transform="translate(${wheelContact.x} ${wheelContact.y - playerSpriteBaseline})"
		>
			<g transform=${drawing.mirror ? "scale(-1 1)" : "scale(1 1)"}>
				<defs>
					<clipPath id=${playerBodyClipId}>
						<path d=${drawing.bodyPath} />
					</clipPath>
				</defs>
				${playerWheelsTemplate(drawing.view)}
				<path d=${drawing.bodyPath} fill="#f3ad50" />
				<g clip-path=${`url(#${playerBodyClipId})`} shape-rendering="crispEdges">
					${playerBodyInteriorTemplate(drawing.view)}
				</g>
				<path d=${drawing.bodyPath} fill="none" stroke="#503b37" stroke-width="7" stroke-linejoin="round" />
				${playerFaceTemplate(drawing.view, handlingObject)}
			</g>
		</g>
	`;
};
