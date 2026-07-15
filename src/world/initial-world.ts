import {
	Body,
	Decoration,
	DecorationKinds,
	defaultSignContent,
	Elevation,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "./components";
import type { EntityId } from "./entity-id";
import { initialFloorTiles } from "./floor";
import {
	crateBody,
	crateEntities,
	crateHeight,
	decorationEntities,
	groundElevation,
	lavaMonsterBody,
	lavaMonsterEntity,
	lavaMonsterSpawnPosition,
	platformEntities,
	playerBody,
	playerEntity,
	playerSpawnPosition,
	roomDepth,
	roomWidth,
	signEntities,
	stationaryVelocity,
	type World,
	wallEntities,
	wallHeight,
	wallThickness,
} from "./world";

export const defaultFloorPlan = Body.make({
	width: roomWidth,
	depth: roomDepth,
});

const defaultFloorTiles = initialFloorTiles(defaultFloorPlan);

const positions = new Map<EntityId, Position>([
	[playerEntity, playerSpawnPosition],
	[lavaMonsterEntity, lavaMonsterSpawnPosition],
	[wallEntities[0], Position.make({ x: roomWidth / 2, y: wallThickness / 2 })],
	[
		wallEntities[1],
		Position.make({
			x: wallThickness / 2,
			y: (roomDepth + wallThickness) / 2,
		}),
	],
	[
		wallEntities[2],
		Position.make({
			x: roomWidth - wallThickness / 2,
			y: (roomDepth + wallThickness) / 2,
		}),
	],
	[
		wallEntities[3],
		Position.make({ x: 328, y: roomDepth - wallThickness / 2 }),
	],
	[
		wallEntities[4],
		Position.make({ x: 957, y: roomDepth - wallThickness / 2 }),
	],
	[crateEntities[0], Position.make({ x: 430, y: 350 })],
	[crateEntities[1], Position.make({ x: 650, y: 445 })],
	[crateEntities[2], Position.make({ x: 770, y: 270 })],
	[crateEntities[3], Position.make({ x: 940, y: 485 })],
	[platformEntities[0], Position.make({ x: 875, y: 125 })],
	[platformEntities[1], Position.make({ x: 285, y: 130 })],
	[signEntities[0], Position.make({ x: roomWidth / 2, y: 150 })],
]);

const bodies = new Map<EntityId, Body>([
	[playerEntity, playerBody],
	[lavaMonsterEntity, lavaMonsterBody],
	[wallEntities[0], Body.make({ width: roomWidth, depth: wallThickness })],
	[
		wallEntities[1],
		Body.make({ width: wallThickness, depth: roomDepth - wallThickness }),
	],
	[
		wallEntities[2],
		Body.make({ width: wallThickness, depth: roomDepth - wallThickness }),
	],
	[wallEntities[3], Body.make({ width: 584, depth: wallThickness })],
	[wallEntities[4], Body.make({ width: 334, depth: wallThickness })],
	...crateEntities.map((entity) => [entity, crateBody] as const),
	[platformEntities[0], Body.make({ width: 260, depth: 160 })],
	[platformEntities[1], Body.make({ width: 230, depth: 130 })],
	[signEntities[0], Body.make({ width: 88, depth: 56 })],
]);

const obstacles = new Map<EntityId, Obstacle>([
	...wallEntities.map(
		(entity) =>
			[
				entity,
				Obstacle.make({ height: wallHeight, kind: ObstacleKinds.Wall }),
			] as const,
	),
	...crateEntities.map(
		(entity) =>
			[
				entity,
				Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
			] as const,
	),
	[
		platformEntities[0],
		Obstacle.make({ height: 48, kind: ObstacleKinds.Platform }),
	],
	[
		platformEntities[1],
		Obstacle.make({ height: 32, kind: ObstacleKinds.Platform }),
	],
]);

const decorations = new Map<EntityId, Decoration>([
	[
		decorationEntities[0],
		Decoration.make({ kind: DecorationKinds.Hopscotch, height: 0 }),
	],
	[
		signEntities[0],
		Decoration.make({ kind: DecorationKinds.Sign, height: 104 }),
	],
]);

positions.set(decorationEntities[0], Position.make({ x: 570, y: 330 }));
bodies.set(decorationEntities[0], Body.make({ width: 190, depth: 330 }));

export const initialWorld: World = {
	positions,
	elevations: new Map([
		[
			playerEntity,
			Elevation.make({ z: groundElevation, velocity: stationaryVelocity }),
		],
		[
			lavaMonsterEntity,
			Elevation.make({ z: groundElevation, velocity: stationaryVelocity }),
		],
	]),
	bodies,
	obstacles,
	decorations,
	floorPlan: defaultFloorPlan,
	floorOrigin: Position.make({ x: 0, y: 0 }),
	floorTiles: defaultFloorTiles,
	floorTileOrigin: Position.make({ x: 0, y: 0 }),
	gameCamera: Position.make({ x: 0, y: 3.7258300203047847 }),
	editor: {
		open: false,
		camera: Position.make({ x: 0, y: 0 }),
		selected: null,
		invalidPlacement: null,
		editSession: null,
	},
	pressed: new Set(),
	playerFacing: PlayerFacings.Down,
	lavaMonsterFacing: PlayerFacings.Left,
	openedChests: new Set(),
	signContents: new Map([[signEntities[0], defaultSignContent]]),
	readingSign: null,
	grabbed: null,
	pushing: null,
	lastFrame: 0,
};
