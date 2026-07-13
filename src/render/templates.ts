import { svg, type TemplateResult } from "lit-html";
import { crateBody, crateHeight } from "../ecs/world";
import type { Body, Elevation, Position } from "../model/component";
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
): TemplateResult => {
	const bottom = footprint(position, body);
	const top = footprint(position, body, height);
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
	grabbed: boolean,
): TemplateResult => {
	const top = footprint(position, crateBody, crateHeight);
	const topInset = footprint(
		position,
		{
			width: crateBody.width - crateVisual.topInsetWidth,
			depth: crateBody.depth - crateVisual.topInsetDepth,
		},
		crateHeight + crateVisual.topLift,
	);
	const frontTop = project(
		{ x: position.x, y: position.y + crateBody.depth / 2 },
		crateHeight,
	);
	const frontBottom = project(
		{ x: position.x, y: position.y + crateBody.depth / 2 },
		0,
	);
	const shadow = footprint(
		{ x: position.x, y: position.y + crateVisual.shadowDepthOffset },
		crateBody,
	);
	const left = frontTop.x - crateBody.width / 2;
	const right = frontTop.x + crateBody.width / 2;
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
		<polygon points=${points(shadow)} fill="#14212a" opacity=${crateVisual.shadowOpacity} />
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
				crateHeight + crateVisual.topLift,
			).y;
			return svg`<line x1=${topInset[0].x} y1=${y} x2=${topInset[1].x} y2=${y} stroke="#8c5738" stroke-width="2" />`;
		})}
		<rect x=${left + crateVisual.panelSideInset} y=${panelTop} width=${crateBody.width - crateVisual.panelSideInset * 2} height=${panelBottom - panelTop} fill="#b87442" stroke="#70452f" stroke-width=${crateVisual.panelOutlineWidth} />
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

export const playerTemplate = (
	position: Position,
	elevation: Elevation,
	shadowHeight: number,
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
		<g transform="translate(${feet.x} ${feet.y - playerSpriteBaseline})">
			<ellipse cx="-10" cy="37" rx="9" ry="5" fill="#503b37" />
			<ellipse cx="10" cy="37" rx="9" ry="5" fill="#503b37" />
			<path d="M -20 35 Q -27 8 -17 -10 Q 0 -30 17 -10 Q 27 8 20 35 Z" fill="#f6b75b" stroke="#503b37" stroke-width="7" />
			<path d="M -20 23 Q 0 31 20 23 L 20 35 L -20 35 Z" fill="#d98b40" opacity=".78" />
			<path d="M -13 -8 Q -18 7 -13 20" fill="none" stroke="#ffd78b" stroke-width="4" stroke-linecap="round" opacity=".68" />
			<circle cx="-7" cy="-3" r="3.5" fill="#382c31" /><circle cx="7" cy="-3" r="3.5" fill="#382c31" />
			<path d="M -8 9 Q 0 15 8 9" fill="none" stroke="#382c31" stroke-width="3" stroke-linecap="round" />
		</g>
	`;
};
