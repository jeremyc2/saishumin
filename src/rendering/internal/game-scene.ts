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
	renderDepthForCharacterAt,
	renderDepthForEntity,
} from "../../presentation/geometry/depth";
import {
	canvasViewportForScreen,
	points,
	project,
	projectedRectangle,
	viewport,
} from "../../presentation/geometry/projection";
import {
	CharacterKinds,
	DecorationKinds,
	ObstacleKinds,
} from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import { surfaceAt } from "../../world/spatial/collision";
import {
	entityBaseElevation,
	shadowSectionsForEntity,
} from "../../world/spatial/elevation";
import { lavaMonsterBody, playerBody, type World } from "../../world/world";
import { mobileControlsTemplate } from "./mobile-controls";

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
	if (world.editor.open) {
		for (const [entity, character] of world.characters) {
			const position = world.characterSpawns.get(entity);
			const body = world.bodies.get(entity);
			if (position === undefined || body === undefined) continue;
			const elevation = surfaceAt(world, position, body);
			const center = project(position, elevation);
			const player = character.kind === CharacterKinds.Player;
			const radius = player ? 27 : 34;
			const color = player ? "#55b9f3" : "#f06a3b";
			objects.push({
				depth: renderDepthForCharacterAt({
					world,
					body,
					position,
					elevation,
				}),
				entity,
				template: svg`
					<g data-character-spawn=${character.kind} aria-label=${player ? "Player spawn point" : "Lava Monster spawn point"}>
						<ellipse cx=${center.x} cy=${center.y} rx=${radius} ry=${radius * 0.5} fill=${color} opacity="0.34" />
						<ellipse cx=${center.x} cy=${center.y} rx=${radius - 5} ry=${(radius - 5) * 0.5} fill="none" stroke=${color} stroke-width="5" vector-effect="non-scaling-stroke" />
						<circle cx=${center.x} cy=${center.y} r="5" fill=${color} />
					</g>
				`,
			});
		}
	}
	if (!world.editor.open) {
		for (const [entity, character] of world.characters) {
			const position = world.positions.get(entity);
			const elevation = world.elevations.get(entity);
			if (position === undefined || elevation === undefined) continue;
			const body =
				character.kind === CharacterKinds.Player ? playerBody : lavaMonsterBody;
			const shadowHeight = surfaceAt(world, position, body, elevation.z);
			objects.push({
				depth: renderDepthForCharacter(world, entity, body),
				template:
					character.kind === CharacterKinds.Player
						? playerTemplate({
								position,
								elevation,
								shadowHeight,
								facing: character.facing,
								handlingObject:
									world.grabbed !== null || world.pushing !== null,
							})
						: lavaMonsterTemplate({
								position,
								elevation,
								shadowHeight,
								facing: character.facing,
							}),
			});
		}
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
	const canvasViewport = world.editor.open
		? canvasViewportForScreen({
				screen:
					typeof window === "undefined"
						? viewport
						: { width: window.innerWidth, height: window.innerHeight },
				zoom: interaction.zoom(),
			})
		: {
				...viewport,
				left: 0,
				top: 0,
				right: viewport.width,
				bottom: viewport.height,
			};
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
			left: canvasViewport.left - camera.x,
			top: canvasViewport.top - camera.y,
			width: canvasViewport.width,
			height: canvasViewport.height,
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
	const floorClick = (event: PointerEvent): void => {
		if (!world.editor.open || !interaction.usesTouchControls()) return;
		event.stopPropagation();
		dispatch(Action.EditorSelectionChanged({ selection: "floor" }));
	};
	const canvasPointerDown = (event: PointerEvent): void => {
		if (!world.editor.open) return;
		if (interaction.isPanGesture(event)) interaction.startPan(event, world);
		else if (event.button === 0)
			dispatch(Action.EditorSelectionChanged({ selection: null }));
	};
	const canvasClick = (): void => {
		if (world.editor.open && interaction.usesTouchControls())
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
		return svg`<g class=${entityClass} @pointerdown=${(event: PointerEvent) => interaction.startEntityMove(event, world, entity, dispatch)} @click=${(
			event: PointerEvent,
		) => {
			event.stopPropagation();
			interaction.selectTouchEntity(world, entity, dispatch);
		}}>${template}</g>`;
	});
	return html`
		<main class=${`relative h-dvh w-screen overflow-hidden bg-[#14212a] ${interaction.isGestureActive() ? "editor-active-gesture" : ""} ${invalidPreview ? "editor-invalid-preview-root" : ""}`} @pointerdown=${onRootPointerDown}>
			<svg id="world-canvas" class=${`block h-full w-full ${canvasClass}`} viewBox=${`${canvasViewport.left} ${canvasViewport.top} ${canvasViewport.width} ${canvasViewport.height}`} preserveAspectRatio=${world.editor.open ? "xMidYMid meet" : "xMidYMid slice"} role="img" aria-label=${world.editor.open ? "Objects editor canvas" : "Room exploration game"} @pointerdown=${canvasPointerDown} @click=${canvasClick} @dblclick=${interaction.zoomAt}>
				<defs>
					<pattern id="editor-dots" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform=${`translate(${camera.x % 32} ${camera.y % 32})`}><circle cx="2" cy="2" r="1.6" fill="#3b5157" /></pattern>
					<clipPath id="outdoor-floor-clip" clipPathUnits="userSpaceOnUse"><polygon points=${points(floor)} /></clipPath>
				</defs>
				${world.editor.open ? svg`<rect width="100%" height="100%" fill="url(#editor-dots)" opacity="0.68" />` : svg``}
				<g transform=${`translate(${camera.x} ${camera.y})`}>
					<polygon data-floor-base points=${points(floor)} fill="#c9b385" @pointerdown=${floorPointerDown} @click=${floorClick} />
					<g pointer-events="none" stroke="#8f8065" stroke-width=${floorGridStrokeWidth} opacity=${floorGridOpacity}>${gridLines}${depthLines}</g>
					<g data-outdoor-floor-tiles clip-path="url(#outdoor-floor-clip)" pointer-events="none">${terrainFloorTemplate(floorTiles)}</g>
					${renderedObjects}
					${world.editor.open ? designStudioView.selectionTemplate(world, invalidPreview, dispatch) : svg``}
				</g>
			</svg>
			<h1 class="pointer-events-none absolute top-7 left-7 m-0 select-none text-[27px] font-heading font-bold tracking-[0.16em] text-[#fff1d6] any-pointer-coarse:top-[max(0.75rem,env(safe-area-inset-top))] any-pointer-coarse:left-[max(0.875rem,env(safe-area-inset-left))] any-pointer-coarse:text-base">SAISHUMIN</h1>
			<div class=${`absolute top-6 z-40 flex flex-row items-center gap-2 any-pointer-coarse:top-[max(0.625rem,env(safe-area-inset-top))] any-pointer-coarse:right-[max(0.75rem,env(safe-area-inset-right))] ${world.editor.open && !sessionActive ? "right-[360px]" : "right-6"} ${world.editor.open && (interaction.isTouchPanelOpen() || interaction.isTouchDetailsOpen()) ? "any-pointer-coarse:hidden" : ""}`}>
				<button type="button" class="inline-flex items-center gap-2 rounded-xl border border-[#e8b875]/70 bg-[#0d181f]/92 px-4 py-3 text-[12px] font-bold tracking-[0.12em] text-[#fff1d6] shadow-lg transition-colors hover:bg-[#1b2d34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff1d6] any-pointer-coarse:min-h-11 any-pointer-coarse:px-[0.8rem] any-pointer-coarse:py-[0.65rem] any-pointer-coarse:text-[0.625rem]" @click=${() => dispatch(Action.EditorToggled())}>
					${world.editor.open ? "PLAY" : "EDIT"}
				</button>
				${world.editor.open && !sessionActive && !interaction.isTouchPanelOpen() ? html`<button type="button" class="hidden min-h-11 items-center rounded-xl border border-[#46656b] bg-[#1b333a]/94 px-3 py-[0.65rem] text-[0.625rem] font-bold tracking-[0.1em] text-[#dcecea] shadow-lg any-pointer-coarse:inline-flex" @click=${interaction.toggleTouchPanel}>OBJECTS</button>` : html``}
			</div>
			${world.editor.open ? html`<div class="pointer-events-none absolute bottom-6 left-7 rounded-xl bg-[#0d181f]/88 px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-[#e8b875] any-pointer-coarse:hidden">CONTROLS PAUSED · INFINITE PAN · FIXED SCALE</div>${designStudioView.editorPanelTemplate(world, !sessionActive, interaction.isTouchPanelOpen() && !sessionActive, dispatch)}` : html`<div class="pointer-events-none absolute bottom-7 left-7 flex max-w-[calc(100vw-3.5rem)] flex-wrap gap-x-12 gap-y-3 rounded-[18px] bg-[#0d181f]/90 px-6 py-4 select-none any-pointer-coarse:hidden"><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">ARROW KEYS</div><div class="mt-1 text-[13px] text-[#aebfba]">MOVE · PUSH CRATES</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">SPACE</div><div class="mt-1 text-[13px] text-[#aebfba]">JUMP · CLIMB · FALL</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">HOLD SHIFT</div><div class="mt-1 text-[13px] text-[#aebfba]">GRAB · DRAG OBJECTS</div></div><div><div class="text-[15px] font-heading font-bold text-[#fff1d6]">X</div><div class="mt-1 text-[13px] text-[#aebfba]">OPEN CHESTS · READ SIGNS</div></div></div>${mobileControlsTemplate({ world, interaction, dispatch })}`}
			${world.editor.open ? mobileControlsTemplate({ world, interaction, dispatch }) : html``}
			<div id="editor-create-preview-host" class="contents"></div>
			${designStudioView.paletteGuidanceTemplate(palettePopover)}
			${world.editor.invalidPlacement === null && !invalidReleased ? html`` : designStudioView.invalidPlacementTemplate(world, editSessionStatus, dispatch)}
			${world.readingSign === null ? html`` : designStudioView.signDialogTemplate(world, dispatch)}
		</main>
	`;
};
