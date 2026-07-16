import { dual } from "effect/Function";
import {
	Body,
	type Character,
	CharacterKinds,
	type Decoration,
	type Elevation,
	type LavaMonsterSteering,
	type Obstacle,
	Position,
	type SignContent,
} from "./components";
import type { EditorState } from "./editor-state";
import type { EntityId } from "./entity-id";
import type { FloorTile } from "./floor";

export type Direction = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export type World = {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly elevations: ReadonlyMap<EntityId, Elevation>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly decorations: ReadonlyMap<EntityId, Decoration>;
	readonly characters: ReadonlyMap<EntityId, Character>;
	readonly lavaMonsterSteering: ReadonlyMap<EntityId, LavaMonsterSteering>;
	readonly floorPlan: Body;
	readonly floorOrigin: Position;
	readonly floorTiles: ReadonlyArray<FloorTile>;
	readonly floorTileOrigin: Position;
	readonly gameCamera: Position;
	readonly editor: EditorState;
	readonly pressed: ReadonlySet<Direction>;
	readonly openedChests: ReadonlySet<EntityId>;
	readonly signContents: ReadonlyMap<EntityId, SignContent>;
	readonly readingSign: EntityId | null;
	readonly grabbed: EntityId | null;
	readonly pushing: EntityId | null;
	readonly lastFrame: number;
};

export const playerEntityIn = (world: World): EntityId | undefined => {
	for (const [entity, character] of world.characters)
		if (character.kind === CharacterKinds.Player) return entity;
	return undefined;
};

export const isPlayerEntity = dual<
	(entity: EntityId) => (self: World) => boolean,
	(self: World, entity: EntityId) => boolean
>(
	2,
	(world: World, entity: EntityId): boolean =>
		world.characters.get(entity)?.kind === CharacterKinds.Player,
);

export const lavaMonsterEntitiesIn = (world: World): ReadonlyArray<EntityId> =>
	[...world.characters]
		.filter(([, character]) => character.kind === CharacterKinds.LavaMonster)
		.map(([entity]) => entity);
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
