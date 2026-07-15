import { html, svg, type TemplateResult } from "lit-html";
import { Action, type Action as AppAction } from "../../app/action";
import { EditSessionStatus } from "../../design-studio/edit-session/edit-session";
import type { DesignStudioInteraction } from "../../design-studio/interaction/interaction";
import type { DesignStudioView } from "../../design-studio/view/view";
import {
	boxTemplate,
	chestTemplate,
	crateTemplate,
	decorationTemplate,
	lavaMonsterTemplate,
	playerTemplate,
} from "../../presentation/artwork/entities";
import { outdoorFloorTiles } from "../../presentation/artwork/outdoor-floor";
import { terrainFloorTemplate } from "../../presentation/artwork/terrain";
import {
	renderDepthForCharacter,
	renderDepthForEntity,
	renderDepthForPlayer,
} from "../../presentation/geometry/depth";
import {
	points,
	project,
	projectedRectangle,
	viewport,
} from "../../presentation/geometry/projection";
import { DecorationKinds, ObstacleKinds } from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import { surfaceAt } from "../../world/spatial/collision";
import {
	entityBaseElevation,
	shadowSectionsForEntity,
} from "../../world/spatial/elevation";
import {
	lavaMonsterBody,
	lavaMonsterEntity,
	playerBody,
	playerEntity,
	type World,
} from "../../world/world";

type Dispatch = (action: AppAction) => void;

const floorGridSpacing = { x: 100, y: 80 } as const;
const floorGridStrokeWidth = 2;
const floorGridOpacity = 0.32;

const interiorGridCoordinates = (
	extent: number,
	spacing: number,
): ReadonlyArray<number> =>
	Array.from(
		{ length: Math.max(0, Math.ceil(extent / spacing) - 1) },
		(_, index) => (index + 1) * spacing,
	);

type RenderedObject = {
	readonly depth: number;
	readonly entity?: EntityId;
	readonly template: TemplateResult;
};

const sceneObjects = (world: World): ReadonlyArray<RenderedObject> => {
	const objects: Array<RenderedObject> = [];
	for (const [entity, obstacle] of world.obstacles) {
		const position = world.positions.get(entity);
		const body = world.bodies.get(entity);
		if (position === undefined || body === undefined) continue;
		const baseElevation = entityBaseElevation(world, entity);
		let template: TemplateResult;
		if (obstacle.kind === ObstacleKinds.Crate)
			template = crateTemplate({
				position,
				body,
				height: obstacle.height,
				grabbed: world.grabbed === entity,
				baseElevation,
				shadowSections: shadowSectionsForEntity(world, entity, position, body),
			});
		else if (obstacle.kind === ObstacleKinds.Chest)
			template = chestTemplate({
				position,
				body,
				height: obstacle.height,
				opened: world.openedChests.has(entity),
				baseElevation,
			});
		else if (obstacle.kind === ObstacleKinds.Wall)
			template = boxTemplate({
				position,
				body,
				height: obstacle.height,
				colors: { top: "#426772", front: "#29454f" },
				baseElevation,
			});
		else
			template = boxTemplate({
				position,
				body,
				height: obstacle.height,
				colors: { top: "#77927e", front: "#4f6c61" },
				baseElevation,
			});
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
				decoration.kind === DecorationKinds.Hopscotch
					? Number.NEGATIVE_INFINITY
					: renderDepthForEntity(world, entity),
			entity,
			template: decorationTemplate({
				position,
				body,
				decoration,
				baseElevation: entityBaseElevation(world, entity),
				grabbed: world.grabbed === entity,
			}),
		});
	}
	if (!world.editor.open) {
		const playerPosition = world.positions.get(playerEntity);
		const playerElevation = world.elevations.get(playerEntity);
		const lavaMonsterPosition = world.positions.get(lavaMonsterEntity);
		const lavaMonsterElevation = world.elevations.get(lavaMonsterEntity);
		if (lavaMonsterPosition !== undefined && lavaMonsterElevation !== undefined)
			objects.push({
				depth: renderDepthForCharacter(
					world,
					lavaMonsterEntity,
					lavaMonsterBody,
				),
				template: lavaMonsterTemplate({
					position: lavaMonsterPosition,
					elevation: lavaMonsterElevation,
					shadowHeight: surfaceAt(
						world,
						lavaMonsterPosition,
						lavaMonsterBody,
						lavaMonsterElevation.z,
					),
					facing: world.lavaMonsterFacing,
				}),
			});
		if (playerPosition !== undefined && playerElevation !== undefined)
			objects.push({
				depth: renderDepthForPlayer(world),
				template: playerTemplate({
					position: playerPosition,
					elevation: playerElevation,
					shadowHeight: surfaceAt(
						world,
						playerPosition,
						playerBody,
						playerElevation.z,
					),
					facing: world.playerFacing,
					handlingObject: world.grabbed !== null || world.pushing !== null,
				}),
			});
	}
	return objects.sort((left, right) => left.depth - right.depth);
};

export const gameSceneTemplate = ({
	world,
	editSessionStatus,
	dispatch,
	interaction,
	designStudioView,
	onRootPointerDown,
}: {
	readonly world: World;
	readonly editSessionStatus: EditSessionStatus;
	readonly dispatch: Dispatch;
	readonly interaction: DesignStudioInteraction;
	readonly designStudioView: DesignStudioView;
	readonly onRootPointerDown: (event: PointerEvent) => void;
}): TemplateResult => {
	const camera = world.editor.open ? world.editor.camera : world.gameCamera;
	const invalidPreview =
		EditSessionStatus.$is("InvalidPreview")(editSessionStatus) ||
		EditSessionStatus.$is("InvalidReleased")(editSessionStatus);
	const sessionActive = !EditSessionStatus.$is("Inactive")(editSessionStatus);
	const invalidReleased =
		EditSessionStatus.$is("InvalidReleased")(editSessionStatus);
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
	const floorPointerDown = (event: PointerEvent): void => {
		if (!world.editor.open) return;
		event.stopPropagation();
		if (interaction.isPanGesture(event)) interaction.startPan(event, world);
		else if (event.button === 0)
			dispatch(Action.EditorSelectionChanged({ selection: "floor" }));
	};
	const canvasPointerDown = (event: PointerEvent): void => {
		if (!world.editor.open) return;
		if (interaction.isPanGesture(event)) interaction.startPan(event, world);
		else if (event.button === 0)
			dispatch(Action.EditorSelectionChanged({ selection: null }));
	};
	const palettePopover = interaction.palettePopover();
	let canvasClass = "";
	if (world.editor.open) {
		canvasClass = "world-editor-canvas touch-none select-none";
		if (invalidPreview) canvasClass += " editor-invalid-preview";
	}
	const renderedObjects = sceneObjects(world).map(({ entity, template }) => {
		if (entity === undefined) return template;
		const entityClass = world.editor.open ? "cursor-move" : "";
		return svg`<g class=${entityClass} @pointerdown=${(event: PointerEvent) => interaction.startEntityMove(event, world, entity, dispatch)}>${template}</g>`;
	});
	return html`
		<main class=${`relative h-screen w-screen overflow-hidden bg-[#14212a] ${interaction.isGestureActive() ? "editor-active-gesture" : ""} ${invalidPreview ? "editor-invalid-preview-root" : ""}`} @pointerdown=${onRootPointerDown}>
			<svg id="world-canvas" class=${`block h-full w-full ${canvasClass}`} viewBox=${`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label=${world.editor.open ? "Infinite canvas design studio" : "Room exploration game"} @pointerdown=${canvasPointerDown}>
				<defs>
					<pattern id="editor-dots" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform=${`translate(${camera.x % 32} ${camera.y % 32})`}><circle cx="2" cy="2" r="1.6" fill="#3b5157" /></pattern>
					<clipPath id="outdoor-floor-clip" clipPathUnits="userSpaceOnUse"><polygon points=${points(floor)} /></clipPath>
				</defs>
				${world.editor.open ? svg`<rect width="100%" height="100%" fill="url(#editor-dots)" opacity="0.68" />` : svg``}
				<g transform=${`translate(${camera.x} ${camera.y})`}>
					<polygon data-floor-base points=${points(floor)} fill="#c9b385" @pointerdown=${floorPointerDown} />
					<g pointer-events="none" stroke="#8f8065" stroke-width=${floorGridStrokeWidth} opacity=${floorGridOpacity}>${gridLines}${depthLines}</g>
					<g data-outdoor-floor-tiles clip-path="url(#outdoor-floor-clip)" pointer-events="none">${terrainFloorTemplate(floorTiles)}</g>
					${renderedObjects}
					${world.editor.open ? designStudioView.selectionTemplate(world, invalidPreview, dispatch) : svg``}
				</g>
			</svg>
			<h1 class="pointer-events-none absolute top-7 left-7 m-0 select-none text-[27px] font-heading font-bold tracking-[0.16em] text-[#fff1d6]">SAISHUMIN</h1>
			<div class=${`absolute top-6 z-40 flex flex-col items-end gap-2 ${world.editor.open && !sessionActive ? "right-[360px]" : "right-6"}`}>
				<button type="button" class="inline-flex items-center gap-2 rounded-xl border border-[#e8b875]/70 bg-[#0d181f]/92 px-4 py-3 text-[12px] font-bold tracking-[0.12em] text-[#fff1d6] shadow-lg transition-colors hover:bg-[#1b2d34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff1d6]" @click=${() => dispatch(Action.EditorToggled())}>
					${world.editor.open ? svg`<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>PLAY` : svg`<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" /><path d="m18 15 4-4" /><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" /></svg>DESIGN STUDIO`}
				</button>
			</div>
			${world.editor.open ? html`<div class="pointer-events-none absolute bottom-6 left-7 rounded-xl bg-[#0d181f]/88 px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-[#e8b875]">CONTROLS PAUSED · INFINITE PAN · FIXED SCALE</div>${designStudioView.editorPanelTemplate(world, !sessionActive, dispatch)}` : html`<div class="pointer-events-none absolute bottom-7 left-7 flex max-w-[calc(100vw-3.5rem)] flex-wrap gap-x-12 gap-y-3 rounded-[18px] bg-[#0d181f]/90 px-6 py-4 select-none"><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">ARROW KEYS</div><div class="mt-1 text-[13px] text-[#aebfba]">MOVE · PUSH CRATES</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">SPACE</div><div class="mt-1 text-[13px] text-[#aebfba]">JUMP · CLIMB · FALL</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">HOLD SHIFT</div><div class="mt-1 text-[13px] text-[#aebfba]">GRAB · DRAG OBJECTS</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">X</div><div class="mt-1 text-[13px] text-[#aebfba]">OPEN CHESTS · READ SIGNS</div></div></div>`}
			<div id="editor-create-preview-host" class="contents"></div>
			${designStudioView.paletteGuidanceTemplate(palettePopover)}
			${world.editor.invalidPlacement === null && !invalidReleased ? html`` : designStudioView.invalidPlacementTemplate(world, editSessionStatus, dispatch)}
			${world.readingSign === null ? html`` : designStudioView.signDialogTemplate(world, dispatch)}
		</main>
	`;
};
