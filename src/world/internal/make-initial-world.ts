import { Effect, Schema } from "effect";
import {
	type Body,
	type Character,
	CharacterKinds,
	type Decoration,
	type Elevation,
	type Obstacle,
	Position,
	type SignContent,
} from "../components";
import type { EntityId } from "../entity-id";
import { initialFloorTiles } from "../floor";
import type { World } from "../world";

export type InitialEntity = {
	readonly entity: EntityId;
	readonly position: Position;
	readonly body: Body;
	readonly elevation?: Elevation;
	readonly obstacle?: Obstacle;
	readonly decoration?: Decoration;
	readonly character?: Character;
	readonly signContent?: SignContent;
};

type InitialWorldDefinition = {
	readonly floorPlan: Body;
	readonly floorOrigin: Position;
	readonly gameCamera: Position;
	readonly entities: ReadonlyArray<InitialEntity>;
};

export class DuplicateInitialEntityError extends Schema.TaggedErrorClass<DuplicateInitialEntityError>()(
	"DuplicateInitialEntityError",
	{ entity: Schema.Int },
) {}

export class MultipleInitialPlayersError extends Schema.TaggedErrorClass<MultipleInitialPlayersError>()(
	"MultipleInitialPlayersError",
	{ count: Schema.Int },
) {}

export type InitialWorldError =
	| DuplicateInitialEntityError
	| MultipleInitialPlayersError;

export const makeInitialWorld = Effect.fnUntraced(function* ({
	floorPlan,
	floorOrigin,
	gameCamera,
	entities,
}: InitialWorldDefinition) {
	const entityIds = new Set<EntityId>();
	for (const { entity } of entities) {
		if (entityIds.has(entity))
			return yield* DuplicateInitialEntityError.make({ entity });
		entityIds.add(entity);
	}
	const players = entities.filter(
		({ character }) => character?.kind === CharacterKinds.Player,
	);
	if (players.length > 1)
		return yield* MultipleInitialPlayersError.make({ count: players.length });
	const world: World = {
		positions: new Map(
			entities.map(({ entity, position }) => [entity, position]),
		),
		elevations: new Map(
			entities.flatMap(({ entity, elevation }) =>
				elevation === undefined ? [] : [[entity, elevation] as const],
			),
		),
		bodies: new Map(entities.map(({ entity, body }) => [entity, body])),
		obstacles: new Map(
			entities.flatMap(({ entity, obstacle }) =>
				obstacle === undefined ? [] : [[entity, obstacle] as const],
			),
		),
		decorations: new Map(
			entities.flatMap(({ entity, decoration }) =>
				decoration === undefined ? [] : [[entity, decoration] as const],
			),
		),
		characters: new Map(
			entities.flatMap(({ entity, character }) =>
				character === undefined ? [] : [[entity, character] as const],
			),
		),
		floorPlan,
		floorOrigin,
		floorTiles: initialFloorTiles(floorPlan),
		floorTileOrigin: floorOrigin,
		gameCamera,
		editor: {
			open: false,
			camera: Position.make({ x: 0, y: 0 }),
			selected: null,
			invalidPlacement: null,
			editSession: null,
		},
		pressed: new Set(),
		openedChests: new Set(),
		signContents: new Map(
			entities.flatMap(({ entity, signContent }) =>
				signContent === undefined ? [] : [[entity, signContent] as const],
			),
		),
		readingSign: null,
		grabbed: null,
		pushing: null,
		lastFrame: 0,
	};
	return world;
});
