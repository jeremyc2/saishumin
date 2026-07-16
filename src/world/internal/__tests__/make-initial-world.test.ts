import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
	Body,
	Character,
	CharacterKinds,
	PlayerFacings,
	Position,
} from "../../components";
import { EntityId } from "../../entity-id";
import {
	DuplicateInitialEntityError,
	MultipleInitialPlayersError,
	makeInitialWorld,
} from "../make-initial-world";

const floorPlan = Body.make({ width: 400, depth: 300 });
const body = Body.make({ width: 40, depth: 40 });
const position = Position.make({ x: 100, y: 100 });
const player = Character.make({
	kind: CharacterKinds.Player,
	facing: PlayerFacings.Down,
});

const failureFor = (
	entities: Parameters<typeof makeInitialWorld>[0]["entities"],
) =>
	Effect.runSync(
		Effect.flip(
			makeInitialWorld({
				floorPlan,
				floorOrigin: Position.make({ x: 0, y: 0 }),
				gameCamera: Position.make({ x: 0, y: 0 }),
				entities,
			}),
		),
	);

describe("makeInitialWorld", () => {
	test("fails with a schema error for duplicate entity IDs", () => {
		const entity = EntityId(50);
		const error = failureFor([
			{ entity, position, body },
			{ entity, position, body },
		]);

		expect(error).toEqual(DuplicateInitialEntityError.make({ entity }));
	});

	test("fails with a schema error for multiple players", () => {
		const error = failureFor([
			{ entity: EntityId(1), position, body, character: player },
			{ entity: EntityId(51), position, body, character: player },
		]);

		expect(error).toEqual(MultipleInitialPlayersError.make({ count: 2 }));
	});
});
