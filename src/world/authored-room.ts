import { Effect, Schema } from "effect";
import {
	Body,
	Character,
	Decoration,
	Elevation,
	Obstacle,
	Position,
	SignContent,
} from "./components";
import { EntityId } from "./entity-id";
import { FloorTile } from "./floor";
import { makeInitialWorld } from "./internal/make-initial-world";
import type { World } from "./world";

const AuthoredEntityId = Schema.Int.check(Schema.isGreaterThan(0));

export const AuthoredEntity = Schema.Struct({
	entity: AuthoredEntityId,
	position: Position,
	body: Body,
	elevation: Schema.optional(Elevation),
	obstacle: Schema.optional(Obstacle),
	decoration: Schema.optional(Decoration),
	character: Schema.optional(Character),
	signContent: Schema.optional(SignContent),
});
export type AuthoredEntity = typeof AuthoredEntity.Type;

export const AuthoredRoom = Schema.Struct({
	floorPlan: Body,
	floorOrigin: Position,
	floorTiles: Schema.Array(FloorTile),
	floorTileOrigin: Position,
	gameCamera: Position,
	entities: Schema.Array(AuthoredEntity),
});
export type AuthoredRoom = typeof AuthoredRoom.Type;

export const authoredRoomFromWorld = (world: World): AuthoredRoom => {
	const entities: Array<AuthoredEntity> = [];
	const entityIds = [...world.positions.keys()].sort(
		(left, right) => left - right,
	);
	for (const entity of entityIds) {
		const position = world.positions.get(entity);
		const body = world.bodies.get(entity);
		if (position === undefined || body === undefined) continue;
		const elevation = world.elevations.get(entity);
		const obstacle = world.obstacles.get(entity);
		const decoration = world.decorations.get(entity);
		const character = world.characters.get(entity);
		const signContent = world.signContents.get(entity);
		entities.push({
			entity,
			position,
			body,
			...(elevation === undefined ? {} : { elevation }),
			...(obstacle === undefined ? {} : { obstacle }),
			...(decoration === undefined ? {} : { decoration }),
			...(character === undefined ? {} : { character }),
			...(signContent === undefined ? {} : { signContent }),
		});
	}
	return AuthoredRoom.make({
		floorPlan: world.floorPlan,
		floorOrigin: world.floorOrigin,
		floorTiles: world.floorTiles,
		floorTileOrigin: world.floorTileOrigin,
		gameCamera: world.gameCamera,
		entities,
	});
};

const encodeAuthoredRoom = Schema.encodeSync(AuthoredRoom);
const decodeAuthoredRoom = Schema.decodeUnknownEffect(
	Schema.fromJsonString(AuthoredRoom),
);

export const stringifyAuthoredRoom = (world: World): string =>
	JSON.stringify(encodeAuthoredRoom(authoredRoomFromWorld(world)), null, 2);

export const worldFromAuthoredRoom = Effect.fnUntraced(function* (
	authoredRoom: AuthoredRoom,
) {
	const world = yield* makeInitialWorld({
		floorPlan: authoredRoom.floorPlan,
		floorOrigin: authoredRoom.floorOrigin,
		gameCamera: authoredRoom.gameCamera,
		entities: authoredRoom.entities.map((entity) => ({
			...entity,
			entity: EntityId(entity.entity),
		})),
	});
	return {
		...world,
		floorTiles: authoredRoom.floorTiles,
		floorTileOrigin: authoredRoom.floorTileOrigin,
	};
});

export class ClipboardWriteError extends Schema.TaggedErrorClass<ClipboardWriteError>()(
	"ClipboardWriteError",
	{ cause: Schema.Defect({ includeStack: true }) },
) {}

export class ClipboardReadError extends Schema.TaggedErrorClass<ClipboardReadError>()(
	"ClipboardReadError",
	{ cause: Schema.Defect({ includeStack: true }) },
) {}

type ClipboardWriter = (text: string) => Promise<void>;
type ClipboardReader = () => Promise<string>;

export const copyAuthoredRoomToClipboard = ({
	world,
	writeText = (text) => navigator.clipboard.writeText(text),
}: {
	readonly world: World;
	readonly writeText?: ClipboardWriter;
}): Effect.Effect<void, ClipboardWriteError> =>
	Effect.tryPromise({
		try: () => writeText(stringifyAuthoredRoom(world)),
		catch: (cause) => ClipboardWriteError.make({ cause }),
	});

export const loadAuthoredRoomFromClipboard = ({
	readText = () => navigator.clipboard.readText(),
}: {
	readonly readText?: ClipboardReader;
} = {}) =>
	Effect.tryPromise({
		try: readText,
		catch: (cause) => ClipboardReadError.make({ cause }),
	}).pipe(
		Effect.flatMap(decodeAuthoredRoom),
		Effect.flatMap(worldFromAuthoredRoom),
	);
