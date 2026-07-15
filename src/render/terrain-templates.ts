import { svg, type TemplateResult } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import type { FloorTerrain } from "../model/floor-tile";
import {
	type OutdoorFloorTile,
	type TerrainCorner,
	type TerrainEdge,
	terrainTileSize,
} from "./outdoor-floor";

type TerrainPalette = {
	readonly base: string;
	readonly dark: string;
	readonly light: string;
	readonly fleck: string;
};

const terrainPalettes: Record<FloorTerrain, TerrainPalette> = {
	grass: {
		base: "#70895d",
		dark: "#4f6b49",
		light: "#91a978",
		fleck: "#c0b66f",
	},
	sand: {
		base: "#b99c69",
		dark: "#92764f",
		light: "#d0b781",
		fleck: "#80664a",
	},
	dirt: {
		base: "#896750",
		dark: "#65493d",
		light: "#a77e5d",
		fleck: "#b99a71",
	},
	cobblestone: {
		base: "#78807a",
		dark: "#555e5a",
		light: "#999f97",
		fleck: "#b3a78a",
	},
};

const detailValue = (
	column: number,
	row: number,
	index: number,
	seed: number,
): number => {
	let value =
		Math.imul(column + seed, 374_761_393) +
		Math.imul(row - seed, 668_265_263) +
		Math.imul(index + 1, 1_274_126_177);
	value = Math.imul(value ^ (value >>> 13), 1_597_334_677);
	return (value >>> 0) / 4_294_967_295;
};

const terrainTextureTemplate = (tile: OutdoorFloorTile): TemplateResult => {
	const palette = terrainPalettes[tile.terrain];
	const details = Array.from({ length: 9 }, (_, index) => ({
		x: 6 + detailValue(tile.column, tile.row, index, 11) * 68,
		y: 5 + detailValue(tile.column, tile.row, index, 23) * 46,
		scale: 0.65 + detailValue(tile.column, tile.row, index, 37) * 0.7,
	}));
	if (tile.terrain === "grass") {
		return svg`
			<rect width=${terrainTileSize.width} height=${terrainTileSize.height} fill=${palette.base} />
			${details.map(
				({ x, y, scale }, index) => svg`<path
					d=${`M ${x} ${y + 5 * scale} Q ${x - 1.5 * scale} ${y + 2 * scale} ${x - 3 * scale} ${y} M ${x} ${y + 5 * scale} Q ${x + 1.5 * scale} ${y + 1.5 * scale} ${x + 3 * scale} ${y - scale}`}
					fill="none"
					stroke=${index % 3 === 0 ? palette.light : palette.dark}
					stroke-width=${1.2 * scale}
					stroke-linecap="round"
					opacity=${index % 3 === 0 ? 0.7 : 0.52}
				/>`,
			)}
			${details
				.slice(0, 3)
				.map(
					({ x, y }) =>
						svg`<circle cx=${x + 5} cy=${y + 2} r="1.1" fill=${palette.fleck} opacity="0.72" />`,
				)}
		`;
	}
	if (tile.terrain === "sand") {
		return svg`
			<rect width=${terrainTileSize.width} height=${terrainTileSize.height} fill=${palette.base} />
			${details.map(({ x, y, scale }, index) =>
				index % 2 === 0
					? svg`<path d=${`M ${x - 3 * scale} ${y} Q ${x} ${y - 2 * scale} ${x + 4 * scale} ${y}`} fill="none" stroke=${palette.light} stroke-width="1.2" stroke-linecap="round" opacity="0.65" />`
					: svg`<circle cx=${x} cy=${y} r=${0.8 * scale} fill=${palette.fleck} opacity="0.52" />`,
			)}
		`;
	}
	if (tile.terrain === "dirt") {
		return svg`
			<rect width=${terrainTileSize.width} height=${terrainTileSize.height} fill=${palette.base} />
			${details.map(
				({ x, y, scale }, index) => svg`<ellipse
					cx=${x}
					cy=${y}
					rx=${(index % 2 === 0 ? 1.8 : 1.1) * scale}
					ry=${0.9 * scale}
					fill=${index % 3 === 0 ? palette.light : palette.dark}
					opacity="0.58"
				/>`,
			)}
		`;
	}
	return svg`
		<rect width=${terrainTileSize.width} height=${terrainTileSize.height} fill=${palette.base} />
		<path d="M 0 18 L 17 16 L 22 0 M 22 0 L 48 2 L 50 17 M 50 17 L 80 15 M 0 38 L 25 40 L 28 18 M 28 40 L 54 38 L 52 17 M 54 38 L 80 41 M 16 56 L 18 39 M 49 56 L 51 39" fill="none" stroke=${palette.dark} stroke-width="1.5" opacity="0.72" />
		<path d="M 2 17 L 17 18 M 24 2 L 47 4 M 2 39 L 24 42 M 30 19 L 48 19 M 56 40 L 78 42" fill="none" stroke=${palette.light} stroke-width="1" opacity="0.55" />
		${details
			.slice(0, 4)
			.map(
				({ x, y }) =>
					svg`<circle cx=${x} cy=${y} r="0.8" fill=${palette.fleck} opacity="0.5" />`,
			)}
	`;
};

const edgePath = (edge: TerrainEdge): string => {
	const width = terrainTileSize.width;
	const height = terrainTileSize.height;
	switch (edge) {
		case "top":
			return `M 0 0 H ${width} V ${height * 0.34} C ${width * 0.78} ${height * 0.5} ${width * 0.65} ${height * 0.25} ${width * 0.48} ${height * 0.39} S ${width * 0.18} ${height * 0.48} 0 ${height * 0.32} Z`;
		case "right":
			return `M ${width} 0 V ${height} H ${width * 0.66} C ${width * 0.52} ${height * 0.77} ${width * 0.77} ${height * 0.62} ${width * 0.62} ${height * 0.46} S ${width * 0.54} ${height * 0.17} ${width * 0.68} 0 Z`;
		case "bottom":
			return `M 0 ${height} H ${width} V ${height * 0.66} C ${width * 0.78} ${height * 0.52} ${width * 0.62} ${height * 0.76} ${width * 0.47} ${height * 0.62} S ${width * 0.18} ${height * 0.54} 0 ${height * 0.7} Z`;
		case "left":
			return `M 0 0 V ${height} H ${width * 0.34} C ${width * 0.48} ${height * 0.78} ${width * 0.23} ${height * 0.62} ${width * 0.38} ${height * 0.46} S ${width * 0.46} ${height * 0.17} ${width * 0.32} 0 Z`;
	}
};

const edgeBoundaryPath = (edge: TerrainEdge): string => {
	const width = terrainTileSize.width;
	const height = terrainTileSize.height;
	switch (edge) {
		case "top":
			return `M 0 ${height * 0.32} C ${width * 0.18} ${height * 0.48} ${width * 0.31} ${height * 0.53} ${width * 0.48} ${height * 0.39} S ${width * 0.78} ${height * 0.5} ${width} ${height * 0.34}`;
		case "right":
			return `M ${width * 0.68} 0 C ${width * 0.54} ${height * 0.17} ${width * 0.47} ${height * 0.3} ${width * 0.62} ${height * 0.46} S ${width * 0.52} ${height * 0.77} ${width * 0.66} ${height}`;
		case "bottom":
			return `M 0 ${height * 0.7} C ${width * 0.18} ${height * 0.54} ${width * 0.31} ${height * 0.49} ${width * 0.47} ${height * 0.62} S ${width * 0.78} ${height * 0.52} ${width} ${height * 0.66}`;
		case "left":
			return `M ${width * 0.32} 0 C ${width * 0.46} ${height * 0.17} ${width * 0.53} ${height * 0.3} ${width * 0.38} ${height * 0.46} S ${width * 0.48} ${height * 0.78} ${width * 0.34} ${height}`;
	}
};

const cornerPath = (corner: TerrainCorner): string => {
	const width = terrainTileSize.width;
	const height = terrainTileSize.height;
	switch (corner) {
		case "top-left":
			return `M 0 0 H ${width * 0.5} C ${width * 0.48} ${height * 0.23} ${width * 0.34} ${height * 0.25} ${width * 0.29} ${height * 0.42} C ${width * 0.2} ${height * 0.56} ${width * 0.11} ${height * 0.52} 0 ${height * 0.58} Z`;
		case "top-right":
			return `M ${width} 0 H ${width * 0.5} C ${width * 0.52} ${height * 0.23} ${width * 0.66} ${height * 0.25} ${width * 0.71} ${height * 0.42} C ${width * 0.8} ${height * 0.56} ${width * 0.89} ${height * 0.52} ${width} ${height * 0.58} Z`;
		case "bottom-right":
			return `M ${width} ${height} H ${width * 0.5} C ${width * 0.52} ${height * 0.77} ${width * 0.66} ${height * 0.75} ${width * 0.71} ${height * 0.58} C ${width * 0.8} ${height * 0.44} ${width * 0.89} ${height * 0.48} ${width} ${height * 0.42} Z`;
		case "bottom-left":
			return `M 0 ${height} H ${width * 0.5} C ${width * 0.48} ${height * 0.77} ${width * 0.34} ${height * 0.75} ${width * 0.29} ${height * 0.58} C ${width * 0.2} ${height * 0.44} ${width * 0.11} ${height * 0.48} 0 ${height * 0.42} Z`;
	}
};

const transitionTemplate = (
	transition: OutdoorFloorTile["transitions"][number],
): TemplateResult => {
	const palette = terrainPalettes[transition.terrain];
	if (transition.corner !== undefined) {
		return svg`<path d=${cornerPath(transition.corner)} fill=${palette.base} />`;
	}
	if (transition.edge === undefined) return svg``;
	return svg`
		<path d=${edgePath(transition.edge)} fill=${palette.base} />
		<path d=${edgeBoundaryPath(transition.edge)} fill="none" stroke=${palette.dark} stroke-width="1.25" stroke-linecap="round" opacity="0.62" />
	`;
};

const terrainTileTemplate = (tile: OutdoorFloorTile): TemplateResult => svg`
	<g transform=${`translate(${tile.position.x} ${tile.position.y})`} data-floor-tile=${`${tile.column}:${tile.row}`} data-terrain=${tile.terrain}>
		${terrainTextureTemplate(tile)}
		${tile.transitions.map(transitionTemplate)}
	</g>
`;

export const terrainFloorTemplate = (
	tiles: ReadonlyArray<OutdoorFloorTile>,
): TemplateResult =>
	svg`${repeat(
		tiles,
		(tile) => `${tile.column}:${tile.row}`,
		terrainTileTemplate,
	)}`;
