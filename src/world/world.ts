import type { Direction } from "../model/control";
import type { EditorState } from "../model/editor";
import type { PlayerFacing } from "./components";
import {
	Body,
	type Decoration,
	type Elevation,
	type Obstacle,
	Position,
	type SignContent,
} from "./components";
import { EntityId } from "./entity-id";
import type { FloorTile } from "./floor";

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
	readonly lavaMonsterFacing: PlayerFacing;
	readonly openedChests: ReadonlySet<EntityId>;
	readonly signContents: ReadonlyMap<EntityId, SignContent>;
	readonly readingSign: EntityId | null;
	readonly grabbed: EntityId | null;
	readonly pushing: EntityId | null;
	readonly lastFrame: number;
};

export const playerEntity = EntityId(1);
export const lavaMonsterEntity = EntityId(2);
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
export const lavaMonsterSpawnPosition = Position.make({ x: 1040, y: 320 });
export const lavaMonsterBody = Body.make({ width: 68, depth: 48 });
export const lavaMonsterCollisionHeight = 72;
export const playerCollisionHeight = 68;
export const crateBody = Body.make({ width: 70, depth: 70 });
export const playerSpeed = 245;
export const lavaMonsterSpeed = 112;
export const lavaMonsterFollowDistance = 82;
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
