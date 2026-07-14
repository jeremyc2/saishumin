import { svg, type TemplateResult } from "lit-html";
import type { ShadowSection } from "../ecs/elevation";
import {
	type Body,
	type Decoration,
	DecorationKinds,
	type Elevation,
	type Position,
} from "../model/component";
import { footprint, insetRectangle, points, project } from "./projection";

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
	topBoardDepthOffsets: [-8, 9],
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
const playerBodyPath = "M -20 35 Q -27 8 -17 -10 Q 0 -30 17 -10 Q 27 8 20 35 Z";
const playerBodyClipId = "player-body-clip";

const playerFaceTemplate = (handlingObject: boolean): TemplateResult => {
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
	const bottom = footprint(position, body, baseElevation);
	const top = footprint(position, body, baseElevation + height);
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
	const top = footprint(position, body, baseElevation + height);
	const topInset = footprint(
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
					footprint(
						{
							x: section.position.x,
							y: section.position.y + crateVisual.shadowDepthOffset,
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
		${crateVisual.topBoardDepthOffsets.map((depthOffset) => {
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

export const decorationTemplate = (
	position: Position,
	body: Body,
	decoration: Decoration,
	baseElevation = 0,
	grabbed = false,
): TemplateResult => {
	if (decoration.kind === DecorationKinds.Rug) {
		const borderWidth = Math.max(4, Math.min(12, body.width / 28));
		return svg`<polygon points=${points(footprint(position, body))} fill="#a95848" stroke="#e8b875" stroke-width=${borderWidth} />`;
	}

	const base = project(position, baseElevation);
	const scale = Math.max(0.55, Math.min(2.6, (body.width + body.depth) / 140));
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
	handlingObject = false,
): TemplateResult => {
	const shadow = project(position, shadowHeight);
	const feet = project(position, elevation.z);
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
	return svg`
		${
			isAirborne
				? svg`<ellipse cx=${shadow.x} cy=${shadow.y + playerShadowVisual.airborneOffset} rx=${playerShadowVisual.airborneRadius.x * shadowScale} ry=${playerShadowVisual.airborneRadius.y * shadowScale} fill="#14212a" opacity=${shadowOpacity} />`
				: hasSurface
					? svg`<ellipse cx=${feet.x} cy=${feet.y} rx=${playerShadowVisual.groundedRadius.x} ry=${playerShadowVisual.groundedRadius.y} fill="#14212a" opacity=${playerShadowVisual.groundedOpacity} />`
					: svg``
		}
		<g data-player-expression=${handlingObject ? "handling" : "neutral"} transform="translate(${feet.x} ${feet.y - playerSpriteBaseline})">
			<defs>
				<clipPath id=${playerBodyClipId}>
					<path d=${playerBodyPath} />
				</clipPath>
			</defs>
			<ellipse cx="-10" cy="37" rx="9" ry="5" fill="#503b37" />
			<ellipse cx="10" cy="37" rx="9" ry="5" fill="#503b37" />
			<path d=${playerBodyPath} fill="#f3ad50" />
			<g clip-path=${`url(#${playerBodyClipId})`} shape-rendering="crispEdges">
				<path d="M -25 -18 H -3 V -12 H -6 V -5 H -9 V 4 H -12 V 13 H -15 V 23 H -18 V 38 H -25 Z" fill="#f9c267" />
				<rect x="-7" y="-9" width="3" height="3" fill="#f9c267" />
				<rect x="-10" y="1" width="3" height="3" fill="#f9c267" />
				<rect x="-13" y="11" width="3" height="3" fill="#f9c267" />
				<path d="M 14 -15 H 25 V 38 H -25 V 32 H 5 V 28 H 8 V 22 H 11 V 14 H 13 V 5 H 15 V -5 H 14 Z" fill="#df8d3f" />
				<rect x="7" y="25" width="3" height="3" fill="#df8d3f" />
				<rect x="10" y="17" width="3" height="3" fill="#df8d3f" />
				<rect x="12" y="8" width="3" height="3" fill="#df8d3f" />
			</g>
			<path d=${playerBodyPath} fill="none" stroke="#503b37" stroke-width="7" />
			${playerFaceTemplate(handlingObject)}
		</g>
	`;
};
