import { Effect } from "effect";
import {
	Body,
	Character,
	CharacterKinds,
	Decoration,
	DecorationKinds,
	defaultSignContent,
	Elevation,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "./components";
import { EntityId } from "./entity-id";
import {
	type InitialEntity,
	makeInitialWorld,
} from "./internal/make-initial-world";
import {
	crateBody,
	crateHeight,
	groundElevation,
	lavaMonsterBody,
	playerBody,
	roomDepth,
	roomWidth,
	stationaryVelocity,
	wallHeight,
	wallThickness,
} from "./world";

const assignEntityIds = (
	entities: ReadonlyArray<Omit<InitialEntity, "entity">>,
): ReadonlyArray<InitialEntity> =>
	entities.map((entity, index) => ({ ...entity, entity: EntityId(index + 1) }));

// This object is the single source of truth for the initial Authored Room.
// Every entity is optional: remove its entry to remove it from the floor plan.
export const initialWorld = Effect.runSync(
	makeInitialWorld({
		floorPlan: Body.make({ width: roomWidth, depth: roomDepth }),
		floorOrigin: Position.make({ x: 0, y: 0 }),
		gameCamera: Position.make({ x: 0, y: 3.7258300203047847 }),
		entities: assignEntityIds([
			{
				position: Position.make({ x: 210, y: 360 }),
				body: playerBody,
				character: Character.make({
					kind: CharacterKinds.Player,
					facing: PlayerFacings.Down,
				}),
				elevation: Elevation.make({
					z: groundElevation,
					velocity: stationaryVelocity,
				}),
			},
			{
				position: Position.make({ x: 1040, y: 320 }),
				body: lavaMonsterBody,
				character: Character.make({
					kind: CharacterKinds.LavaMonster,
					facing: PlayerFacings.Left,
				}),
				elevation: Elevation.make({
					z: groundElevation,
					velocity: stationaryVelocity,
				}),
			},
			{
				position: Position.make({ x: roomWidth / 2, y: wallThickness / 2 }),
				body: Body.make({ width: roomWidth, depth: wallThickness }),
				obstacle: Obstacle.make({
					height: wallHeight,
					kind: ObstacleKinds.Wall,
				}),
			},
			{
				position: Position.make({
					x: wallThickness / 2,
					y: (roomDepth + wallThickness) / 2,
				}),
				body: Body.make({
					width: wallThickness,
					depth: roomDepth - wallThickness,
				}),
				obstacle: Obstacle.make({
					height: wallHeight,
					kind: ObstacleKinds.Wall,
				}),
			},
			{
				position: Position.make({
					x: roomWidth - wallThickness / 2,
					y: (roomDepth + wallThickness) / 2,
				}),
				body: Body.make({
					width: wallThickness,
					depth: roomDepth - wallThickness,
				}),
				obstacle: Obstacle.make({
					height: wallHeight,
					kind: ObstacleKinds.Wall,
				}),
			},
			{
				position: Position.make({
					x: 328,
					y: roomDepth - wallThickness / 2,
				}),
				body: Body.make({ width: 584, depth: wallThickness }),
				obstacle: Obstacle.make({
					height: wallHeight,
					kind: ObstacleKinds.Wall,
				}),
			},
			{
				position: Position.make({
					x: 957,
					y: roomDepth - wallThickness / 2,
				}),
				body: Body.make({ width: 334, depth: wallThickness }),
				obstacle: Obstacle.make({
					height: wallHeight,
					kind: ObstacleKinds.Wall,
				}),
			},
			{
				position: Position.make({ x: 430, y: 350 }),
				body: crateBody,
				obstacle: Obstacle.make({
					height: crateHeight,
					kind: ObstacleKinds.Crate,
				}),
			},
			{
				position: Position.make({ x: 650, y: 445 }),
				body: crateBody,
				obstacle: Obstacle.make({
					height: crateHeight,
					kind: ObstacleKinds.Crate,
				}),
			},
			{
				position: Position.make({ x: 770, y: 270 }),
				body: crateBody,
				obstacle: Obstacle.make({
					height: crateHeight,
					kind: ObstacleKinds.Crate,
				}),
			},
			{
				position: Position.make({ x: 940, y: 485 }),
				body: crateBody,
				obstacle: Obstacle.make({
					height: crateHeight,
					kind: ObstacleKinds.Crate,
				}),
			},
			{
				position: Position.make({ x: 875, y: 125 }),
				body: Body.make({ width: 260, depth: 160 }),
				obstacle: Obstacle.make({
					height: 48,
					kind: ObstacleKinds.Platform,
				}),
			},
			{
				position: Position.make({ x: 285, y: 130 }),
				body: Body.make({ width: 230, depth: 130 }),
				obstacle: Obstacle.make({
					height: 32,
					kind: ObstacleKinds.Platform,
				}),
			},
			{
				position: Position.make({ x: roomWidth / 2, y: 150 }),
				body: Body.make({ width: 88, depth: 56 }),
				decoration: Decoration.make({
					kind: DecorationKinds.Sign,
					height: 104,
				}),
				signContent: defaultSignContent,
			},
			{
				position: Position.make({ x: 570, y: 330 }),
				body: Body.make({ width: 190, depth: 330 }),
				decoration: Decoration.make({
					kind: DecorationKinds.Hopscotch,
					height: 0,
				}),
			},
		]),
	}).pipe(Effect.orDie),
);
