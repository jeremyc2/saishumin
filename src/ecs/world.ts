import {
	Body,
	Decoration,
	DecorationKinds,
	defaultSignContent,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
	type SignContent,
} from "../model/component";
import type { Direction } from "../model/control";
import type { EditorState } from "../model/editor";
import { EntityId } from "../model/entity-id";
import { type FloorTile, initialFloorTiles } from "../model/floor-tile";
import { type PlayerFacing, PlayerFacings } from "../model/player-facing";
import { cameraForFloor } from "../render/projection";

export type World = {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly elevations: ReadonlyMap<EntityId, Elevation>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly decorations: ReadonlyMap<EntityId, Decoration>;
	readonly floorPlan: Body;
	readonly floorOrigin: Position;
	readonly floorTiles: ReadonlyArray<FloorTile>;
	readonly floorTileOrigin: Position;
	readonly gameCamera: Position;
	readonly editor: EditorState;
	readonly pressed: ReadonlySet<Direction>;
	readonly playerFacing: PlayerFacing;
	readonly openedChests: ReadonlySet<EntityId>;
	readonly signContents: ReadonlyMap<EntityId, SignContent>;
	readonly readingSign: EntityId | null;
	readonly grabbed: EntityId | null;
	readonly pushing: EntityId | null;
	readonly lastFrame: number;
};

export const playerEntity = EntityId(1);
export const roomWidth = 1160;
export const roomDepth = 640;
export const minimumFloorWidth = 360;
export const minimumFloorDepth = 280;
export const minimumEntityExtent = 24;
export const wallThickness = 36;
export const groundElevation = 0;
export const stationaryVelocity = 0;
export const playerSpawnPosition = Position.make({ x: 210, y: 360 });
export const playerBody = Body.make({ width: 54, depth: 34 });
export const playerCollisionHeight = 68;
export const crateBody = Body.make({ width: 70, depth: 70 });
export const playerSpeed = 245;
export const jumpSpeed = 510;
export const gravity = 1180;
export const obstacleHeightTolerance = 5;
export const cratePushSlowdown = 0.4;
export const fallResetElevation = -430;
export const maximumFrameElapsedSeconds = 0.05;
export const interactionDistance = playerSpeed * maximumFrameElapsedSeconds;
export const millisecondsPerSecond = 1000;
export const crateGrabDistance = 72;
export const wallHeight = 80;
export const crateHeight = 62;

export const wallEntities = [
	EntityId(100),
	EntityId(101),
	EntityId(102),
	EntityId(103),
	EntityId(104),
] as const;
export const backgroundWallEntities = [wallEntities[0]] as const;
export const foregroundWallEntities = [
	wallEntities[1],
	wallEntities[2],
	wallEntities[3],
	wallEntities[4],
] as const;
export const crateEntities = [
	EntityId(200),
	EntityId(201),
	EntityId(202),
	EntityId(203),
] as const;
export const platformEntities = [EntityId(300), EntityId(301)] as const;
export const decorationEntities = [EntityId(400)] as const;
export const signEntities = [EntityId(401)] as const;

export const defaultFloorPlan = Body.make({
	width: roomWidth,
	depth: roomDepth,
});

const defaultFloorTiles = initialFloorTiles(defaultFloorPlan);

const positions = new Map<EntityId, Position>([
	[playerEntity, playerSpawnPosition],
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
		Decoration.make({ kind: DecorationKinds.Rug, height: 0 }),
	],
	[
		signEntities[0],
		Decoration.make({ kind: DecorationKinds.Sign, height: 104 }),
	],
]);

positions.set(decorationEntities[0], Position.make({ x: 570, y: 330 }));
bodies.set(decorationEntities[0], Body.make({ width: 330, depth: 190 }));

export const initialWorld: World = {
	positions,
	elevations: new Map([
		[
			playerEntity,
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
	gameCamera: cameraForFloor(defaultFloorPlan),
	editor: {
		open: false,
		camera: Position.make({ x: 0, y: 0 }),
		selected: null,
		invalidPlacement: null,
		editSession: null,
	},
	pressed: new Set(),
	playerFacing: PlayerFacings.Down,
	openedChests: new Set(),
	signContents: new Map([[signEntities[0], defaultSignContent]]),
	readingSign: null,
	grabbed: null,
	pushing: null,
	lastFrame: 0,
};
