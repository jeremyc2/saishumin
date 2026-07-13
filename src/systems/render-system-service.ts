import { Context, Layer } from "effect";
import { html, render, svg, type TemplateResult } from "lit-html";
import { overlaps, surfaceAt } from "../ecs/collision";
import {
	backgroundWallEntities,
	crateEntities,
	foregroundWallEntities,
	obstacleHeightTolerance,
	platformEntities,
	playerBody,
	playerEntity,
	roomDepth,
	roomWidth,
	type World,
	wallHeight,
} from "../ecs/world";
import { ObstacleKinds } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { footprint, points, project, visualDepth } from "../render/projection";
import {
	boxTemplate,
	crateTemplate,
	playerTemplate,
} from "../render/templates";

export class RenderSystemService extends Context.Service<
	RenderSystemService,
	{
		readonly render: (world: World) => void;
	}
>()("saishumin/systems/render-system-service/RenderSystemService") {
	static readonly layer = Layer.sync(this, () => {
		const viewport = { width: 1600, height: 900 } as const;
		const floorGridSpacing = { x: 100, y: 80 } as const;
		const rugPosition = { x: 570, y: 330 } as const;
		const rugBody = { width: 330, depth: 190 } as const;
		const rugBorderWidth = 10;
		const floorGridStrokeWidth = 2;
		const floorGridOpacity = 0.32;
		const supportedObjectDepthOffset = 0.5;
		const interiorGridCoordinates = (
			extent: number,
			spacing: number,
		): ReadonlyArray<number> =>
			Array.from(
				{ length: Math.ceil(extent / spacing) - 1 },
				(_, index) => (index + 1) * spacing,
			);

		const renderWorld = (world: World): void => {
			const playerPosition = world.positions.get(playerEntity);
			const playerElevation = world.elevations.get(playerEntity);
			if (playerPosition === undefined || playerElevation === undefined) return;

			const floor = footprint(
				{ x: roomWidth / 2, y: roomDepth / 2 },
				{ width: roomWidth, depth: roomDepth },
			);
			const gridLines = interiorGridCoordinates(
				roomWidth,
				floorGridSpacing.x,
			).map(
				(x) =>
					svg`<line x1=${project({ x, y: 0 }).x} y1=${project({ x, y: 0 }).y} x2=${project({ x, y: roomDepth }).x} y2=${project({ x, y: roomDepth }).y} />`,
			);
			const depthLines = interiorGridCoordinates(
				roomDepth,
				floorGridSpacing.y,
			).map(
				(y) =>
					svg`<line x1=${project({ x: 0, y }).x} y1=${project({ x: 0, y }).y} x2=${project({ x: roomWidth, y }).x} y2=${project({ x: roomWidth, y }).y} />`,
			);
			const shadowHeight = surfaceAt(world, playerPosition, playerBody);
			let playerDepth = visualDepth(playerPosition);
			let shouldRenderPlayerAboveWalls = false;
			for (const [entity, obstacle] of world.obstacles) {
				const obstaclePosition = world.positions.get(entity);
				const obstacleBody = world.bodies.get(entity);
				if (
					obstaclePosition !== undefined &&
					obstacleBody !== undefined &&
					playerElevation.z >= obstacle.height - obstacleHeightTolerance &&
					overlaps(playerPosition, playerBody, obstaclePosition, obstacleBody)
				) {
					playerDepth = Math.max(
						playerDepth,
						visualDepth(obstaclePosition) + supportedObjectDepthOffset,
					);
				}
				if (
					obstaclePosition !== undefined &&
					obstacleBody !== undefined &&
					obstacle.kind === ObstacleKinds.Wall &&
					playerElevation.z >= obstacle.height - obstacleHeightTolerance &&
					overlaps(playerPosition, playerBody, obstaclePosition, obstacleBody)
				) {
					shouldRenderPlayerAboveWalls = true;
				}
			}
			const player = playerTemplate(
				playerPosition,
				playerElevation,
				shadowHeight,
			);
			const wallTemplate = (entity: EntityId): TemplateResult => {
				const position = world.positions.get(entity);
				const body = world.bodies.get(entity);
				return position === undefined || body === undefined
					? svg``
					: boxTemplate(position, body, wallHeight, {
							top: "#426772",
							front: "#29454f",
						});
			};
			const foregroundWalls = foregroundWallEntities.map(wallTemplate);
			const objects: ReadonlyArray<{
				readonly depth: number;
				readonly template: TemplateResult;
			}> = [
				...backgroundWallEntities.flatMap((entity) => {
					const position = world.positions.get(entity);
					return position === undefined
						? []
						: [
								{
									depth: visualDepth(position),
									template: wallTemplate(entity),
								},
							];
				}),
				...platformEntities.flatMap((entity) => {
					const position = world.positions.get(entity);
					const body = world.bodies.get(entity);
					const obstacle = world.obstacles.get(entity);
					return position === undefined ||
						body === undefined ||
						obstacle === undefined
						? []
						: [
								{
									depth: visualDepth(position),
									template: boxTemplate(position, body, obstacle.height, {
										top: "#77927e",
										front: "#4f6c61",
									}),
								},
							];
				}),
				...crateEntities.flatMap((entity) => {
					const position = world.positions.get(entity);
					return position === undefined
						? []
						: [
								{
									depth: visualDepth(position),
									template: crateTemplate(position, world.grabbed === entity),
								},
							];
				}),
				...(shouldRenderPlayerAboveWalls
					? []
					: [{ depth: playerDepth, template: player }]),
			].sort((left, right) => left.depth - right.depth);

			render(
				html`
		<main class="relative h-screen w-screen overflow-hidden bg-[#14212a]">
			<svg class="block h-full w-full" viewBox=${`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="45-degree room exploration game with jumping and pushable crates">
				<polygon points=${points(floor)} fill="#c9b385" />
				<g stroke="#8f8065" stroke-width=${floorGridStrokeWidth} opacity=${floorGridOpacity}>${gridLines}${depthLines}</g>
				<polygon points=${points(footprint(rugPosition, rugBody))} fill="#a95848" stroke="#e8b875" stroke-width=${rugBorderWidth} />
				${objects.map(({ template }) => template)}
				${foregroundWalls}
				${shouldRenderPlayerAboveWalls ? player : svg``}
			</svg>
			<h1 class="pointer-events-none absolute top-7 left-7 m-0 select-none text-[27px] font-bold tracking-[0.16em] text-[#fff1d6]">SAISHUMIN</h1>
			<div class="pointer-events-none absolute bottom-7 left-7 flex max-w-[calc(100vw-3.5rem)] flex-wrap gap-x-12 gap-y-3 rounded-[18px] bg-[#0d181f]/90 px-6 py-4 select-none">
				<div>
					<div class="text-[15px] font-bold text-[#fff1d6]">ARROW KEYS</div>
					<div class="mt-1 text-[13px] text-[#aebfba]">MOVE · PUSH CRATES</div>
				</div>
				<div>
					<div class="text-[15px] font-bold text-[#fff1d6]">SPACE</div>
					<div class="mt-1 text-[13px] text-[#aebfba]">JUMP · CLIMB · FALL</div>
				</div>
				<div>
					<div class="text-[15px] font-bold text-[#fff1d6]">HOLD SHIFT</div>
					<div class="mt-1 text-[13px] text-[#aebfba]">GRAB · DRAG CRATES</div>
				</div>
			</div>
		</main>
	`,
				document.body,
			);
		};
		return { render: renderWorld };
	});
}
