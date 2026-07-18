import { describe, expect, test } from "bun:test";
import {
	Body,
	Character,
	CharacterKinds,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../../components";
import { EntityId } from "../../entity-id";
import { initialWorld } from "../../initial-world";
import {
	interactionDistance,
	playerBody,
	stationaryVelocity,
	type World,
} from "../../world";
import { contextualInteractionTarget } from "../contextual-interaction";

const player = EntityId(1);
const interactable = EntityId(2);
const objectBody = Body.make({ width: 88, depth: 56 });
const objectPosition = Position.make({ x: 500, y: 400 });
const playerPosition = Position.make({
	x: objectPosition.x,
	y: objectPosition.y + (objectBody.depth + playerBody.depth) / 2,
});

const interactionWorld = (kind: "chest" | "sign"): World => ({
	...initialWorld,
	positions: new Map([
		[player, playerPosition],
		[interactable, objectPosition],
	]),
	elevations: new Map([
		[player, Elevation.make({ z: 0, velocity: stationaryVelocity })],
	]),
	bodies: new Map([
		[player, playerBody],
		[interactable, objectBody],
	]),
	obstacles:
		kind === "chest"
			? new Map([
					[
						interactable,
						Obstacle.make({ kind: ObstacleKinds.Chest, height: 52 }),
					],
				])
			: new Map(),
	decorations:
		kind === "sign"
			? new Map([
					[
						interactable,
						Decoration.make({ kind: DecorationKinds.Sign, height: 104 }),
					],
				])
			: new Map(),
	characters: new Map([
		[
			player,
			Character.make({
				kind: CharacterKinds.Player,
				facing: PlayerFacings.Up,
			}),
		],
	]),
	readingSign: null,
	grabbed: null,
});

describe("contextual interaction target", () => {
	test("finds a chest or sign when the player can interact from its front", () => {
		expect(contextualInteractionTarget(interactionWorld("chest"))).toEqual({
			entity: interactable,
			kind: "chest",
		});
		expect(contextualInteractionTarget(interactionWorld("sign"))).toEqual({
			entity: interactable,
			kind: "sign",
		});
	});

	test("hides the target when facing away, too far away, or reading", () => {
		const world = interactionWorld("sign");
		const character = world.characters.get(player);
		if (character === undefined) throw new Error("Expected player Character");
		expect(
			contextualInteractionTarget({
				...world,
				characters: new Map(world.characters).set(player, {
					...character,
					facing: PlayerFacings.Down,
				}),
			}),
		).toBeNull();
		expect(
			contextualInteractionTarget({
				...world,
				positions: new Map(world.positions).set(
					player,
					Position.make({
						x: playerPosition.x,
						y: playerPosition.y + interactionDistance + 1,
					}),
				),
			}),
		).toBeNull();
		expect(
			contextualInteractionTarget({ ...world, readingSign: interactable }),
		).toBeNull();
	});
});
