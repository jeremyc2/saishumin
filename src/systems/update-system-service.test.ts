import { afterAll, describe, expect, test } from "bun:test";
import { Layer, ManagedRuntime } from "effect";
import { isPlayerPlacementValid } from "../ecs/player-placement";
import { Action } from "../model/action";
import { Controls, type Direction } from "../model/control";
import { editSessionView } from "../design-studio/edit-session/edit-session";
import {
	defaultEditorItemBody,
	EditorItemKinds,
	editorItemHeightLimits,
	maximumEditorItemBody,
} from "../design-studio/model";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../world/components";
import { EntityId } from "../world/entity-id";
import { initialWorld } from "../world/initial-world";
import {
	crateBody,
	crateEntities,
	crateHeight,
	groundElevation,
	interactionDistance,
	jumpSpeed,
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	platformEntities,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../world/world";
import { MovementSystemService } from "../gameplay/movement/movement-system";
import { UpdateSystemService } from "./update-system-service";

const runtime = ManagedRuntime.make(
	UpdateSystemService.layer.pipe(Layer.provide(MovementSystemService.layer)),
);
const updateSystem = runtime.runSync(UpdateSystemService);

afterAll(() => runtime.dispose());

const makeWorld = ({
	positions,
	bodies,
	obstacles,
	pressed,
	grabbed,
}: {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly pressed: ReadonlySet<Direction>;
	readonly grabbed: EntityId | null;
}): World => ({
	...initialWorld,
	positions,
	elevations: new Map([
		[
			playerEntity,
			Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
		],
	]),
	bodies,
	obstacles,
	pressed,
	grabbed,
	lastFrame: 1000,
});

describe("UpdateSystemService", () => {
	test("previews a new Editor Item without changing the authored World, then commits it", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "create",
					itemKind: EditorItemKinds.Hopscotch,
					position: Position.make({ x: 500, y: 300 }),
				},
			}),
		);

		const preview = editSessionView(begun);
		expect(begun.positions).toBe(editing.positions);
		expect(preview.positions.size).toBe(editing.positions.size + 1);
		expect(begun.editor.editSession?.validity).toEqual({ kind: "valid" });

		const committed = updateSystem.update(
			begun,
			Action.EditorEditSessionCommitted(),
		);
		expect(committed.positions.size).toBe(editing.positions.size + 1);
		expect(committed.editor.editSession).toBeNull();
	});

	test("advances the camera and Edit Session preview in one auto-pan snapshot", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "create",
					itemKind: EditorItemKinds.Hopscotch,
					position: Position.make({ x: 500, y: 300 }),
				},
			}),
		);
		const advanced = updateSystem.update(
			begun,
			Action.EditorEditSessionAutoPanned({
				camera: Position.make({ x: -120, y: 40 }),
				preview: {
					kind: "create",
					position: Position.make({ x: 620, y: 260 }),
				},
			}),
		);

		expect(advanced.editor.camera).toEqual({ x: -120, y: 40 });
		expect(advanced.editor.editSession?.operation).toMatchObject({
			kind: "create",
			position: { x: 620, y: 260 },
		});
	});

	test("keeps an invalid move preview visible until cancellation without changing the authored World", () => {
		const entity = crateEntities[0];
		const originalPosition = initialWorld.positions.get(entity);
		const originalBody = initialWorld.bodies.get(entity);
		expect(originalPosition).toBeDefined();
		expect(originalBody).toBeDefined();
		if (originalPosition === undefined || originalBody === undefined) return;
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "move",
					entity,
					originalPosition,
					originalBody,
					position: originalPosition,
				},
			}),
		);
		const previewed = updateSystem.update(
			begun,
			Action.EditorEditSessionPreviewed({
				preview: { kind: "move", position: Position.make({ x: -100, y: 100 }) },
			}),
		);
		const released = updateSystem.update(
			previewed,
			Action.EditorEditSessionCommitted(),
		);

		expect(released.positions.get(entity)).toEqual(originalPosition);
		expect(editSessionView(released).positions.get(entity)).toEqual({
			x: -100,
			y: 100,
		});
		expect(released.editor.editSession).toMatchObject({
			validity: { kind: "invalid", reason: "outside-floor" },
			phase: "invalid-released",
		});

		const cancelled = updateSystem.update(
			released,
			Action.EditorEditSessionCancelled(),
		);
		expect(cancelled.positions.get(entity)).toEqual(originalPosition);
		expect(cancelled.editor.editSession).toBeNull();
	});

	test("faces movement input and keeps facing after release", () => {
		const facingUp = updateSystem.update(
			initialWorld,
			Action.KeyChanged({ key: Controls.Up, pressed: true }),
		);
		const facingUpLeft = updateSystem.update(
			facingUp,
			Action.KeyChanged({ key: Controls.Left, pressed: true }),
		);
		const stopped = updateSystem.update(
			updateSystem.update(
				facingUpLeft,
				Action.KeyChanged({ key: Controls.Up, pressed: false }),
			),
			Action.KeyChanged({ key: Controls.Left, pressed: false }),
		);

		expect(facingUp.playerFacing).toBe(PlayerFacings.Up);
		expect(facingUpLeft.playerFacing).toBe(PlayerFacings.UpLeft);
		expect(stopped.playerFacing).toBe(PlayerFacings.Left);
	});

	test("opens and closes a chest only from its front", () => {
		const chest = EntityId(699);
		const chestPosition = Position.make({ x: 500, y: 400 });
		const chestBody = defaultEditorItemBody(EditorItemKinds.Chest);
		const frontPosition = Position.make({
			x: chestPosition.x,
			y: chestPosition.y + (chestBody.depth + playerBody.depth) / 2,
		});
		const world: World = {
			...initialWorld,
			positions: new Map([
				[playerEntity, frontPosition],
				[chest, chestPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[chest, chestBody],
			]),
			obstacles: new Map([
				[
					chest,
					Obstacle.make({
						height: 52,
						kind: ObstacleKinds.Chest,
					}),
				],
			]),
			decorations: new Map(),
			elevations: new Map([
				[
					playerEntity,
					Elevation.make({
						z: groundElevation,
						velocity: stationaryVelocity,
					}),
				],
			]),
			playerFacing: PlayerFacings.Up,
		};

		const opened = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(opened.openedChests.has(chest)).toBe(true);

		const closed = updateSystem.update(
			opened,
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(closed.openedChests.has(chest)).toBe(false);

		const wrongFacing = updateSystem.update(
			{ ...world, playerFacing: PlayerFacings.Down },
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(wrongFacing.openedChests.has(chest)).toBe(false);

		const tooFar = updateSystem.update(
			{
				...world,
				positions: new Map(world.positions).set(
					playerEntity,
					Position.make({
						x: chestPosition.x,
						y: frontPosition.y + interactionDistance + 1,
					}),
				),
			},
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(tooFar.openedChests.has(chest)).toBe(false);
	});

	test("reads a sign only from its front and dismisses it with X", () => {
		const sign = EntityId(698);
		const signPosition = Position.make({ x: 500, y: 400 });
		const signBody = defaultEditorItemBody(EditorItemKinds.Sign);
		const frontPosition = Position.make({
			x: signPosition.x,
			y: signPosition.y + (signBody.depth + playerBody.depth) / 2,
		});
		const world: World = {
			...initialWorld,
			positions: new Map([
				[playerEntity, frontPosition],
				[sign, signPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[sign, signBody],
			]),
			obstacles: new Map(),
			decorations: new Map([
				[
					sign,
					Decoration.make({
						height: 104,
						kind: DecorationKinds.Sign,
					}),
				],
			]),
			elevations: new Map([
				[
					playerEntity,
					Elevation.make({
						z: groundElevation,
						velocity: stationaryVelocity,
					}),
				],
			]),
			playerFacing: PlayerFacings.Up,
		};

		const reading = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(reading.readingSign).toBe(sign);

		const dismissed = updateSystem.update(
			reading,
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(dismissed.readingSign).toBeNull();
		expect(
			updateSystem.update(reading, Action.SignDismissed()).readingSign,
		).toBeNull();

		const wrongFacing = updateSystem.update(
			{ ...world, playerFacing: PlayerFacings.Down },
			Action.KeyChanged({ key: Controls.Interact, pressed: true }),
		);
		expect(wrongFacing.readingSign).toBeNull();
	});

	test("grabs nearby plants and lamps on the player's surface", () => {
		for (const [kind, height] of [
			[DecorationKinds.Plant, 84],
			[DecorationKinds.Lamp, 96],
		] as const) {
			const entity = EntityId(700 + height);
			const world: World = {
				...initialWorld,
				positions: new Map([
					[playerEntity, Position.make({ x: 300, y: 300 })],
					[entity, Position.make({ x: 350, y: 300 })],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[entity, Body.make({ width: 64, depth: 64 })],
				]),
				obstacles: new Map(),
				decorations: new Map([[entity, Decoration.make({ kind, height })]]),
				elevations: new Map([
					[
						playerEntity,
						Elevation.make({
							z: groundElevation,
							velocity: stationaryVelocity,
						}),
					],
				]),
			};

			const grabbed = updateSystem.update(
				world,
				Action.KeyChanged({ key: Controls.Grab, pressed: true }),
			);

			expect(grabbed.grabbed).toBe(entity);
		}
	});

	test("releases a grabbed crate when the player jumps", () => {
		const world = { ...initialWorld, grabbed: crateEntities[0] };

		const result = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);

		expect(result.grabbed).toBeNull();
		expect(result.elevations.get(playerEntity)?.velocity).toBe(jumpSpeed);
	});

	test("keeps the grab when a jump cannot start", () => {
		const crateEntity = crateEntities[0];
		const elevations = new Map(initialWorld.elevations);
		elevations.set(playerEntity, { z: 20, velocity: jumpSpeed });
		const world = {
			...initialWorld,
			elevations,
			grabbed: crateEntity,
		};

		const result = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);

		expect(result).toBe(world);
		expect(result.grabbed).toBe(crateEntity);
	});

	test("moves onto a platform after releasing a crate from beside the player", () => {
		const crateEntity = crateEntities[0];
		const platformEntity = platformEntities[0];
		const world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 300, y: 300 })],
				[crateEntity, Position.make({ x: 300, y: 360 })],
				[platformEntity, Position.make({ x: 400, y: 300 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
				[platformEntity, Body.make({ width: 130, depth: 50 })],
			]),
			obstacles: new Map([
				[
					crateEntity,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
				[
					platformEntity,
					Obstacle.make({ height: 32, kind: ObstacleKinds.Platform }),
				],
			]),
			pressed: new Set([Controls.Right]),
			grabbed: crateEntity,
		});

		const jumped = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);
		const firstFrame = updateSystem.update(jumped, Action.Tick({ time: 1050 }));
		const secondFrame = updateSystem.update(
			firstFrame,
			Action.Tick({ time: 1100 }),
		);
		const thirdFrame = updateSystem.update(
			secondFrame,
			Action.Tick({ time: 1150 }),
		);

		expect(thirdFrame.grabbed).toBeNull();
		expect(thirdFrame.positions.get(playerEntity)?.x).toBe(312.25);
		expect(thirdFrame.positions.get(crateEntity)?.x).toBe(300);
	});

	test("pauses controls and movement while the editor is open", () => {
		const crateEntity = crateEntities[0];
		const playing = {
			...initialWorld,
			pressed: new Set<Direction>([Controls.Right]),
			grabbed: crateEntity,
			lastFrame: 1000,
		};

		const editing = updateSystem.update(playing, Action.EditorToggled());
		const afterKey = updateSystem.update(
			editing,
			Action.KeyChanged({ key: Controls.Right, pressed: true }),
		);
		const afterTick = updateSystem.update(
			afterKey,
			Action.Tick({ time: 1050 }),
		);

		expect(editing.editor.open).toBe(true);
		expect(editing.pressed.size).toBe(0);
		expect(editing.grabbed).toBeNull();
		expect(afterKey).toBe(editing);
		expect(afterTick.positions.get(playerEntity)).toEqual(
			editing.positions.get(playerEntity),
		);
		expect(afterTick.lastFrame).toBe(1050);
	});

	test("allows editing over the hidden player and relocates them for play", () => {
		const entity = crateEntities[0];
		const playerPosition = initialWorld.positions.get(playerEntity);
		const originalPosition = initialWorld.positions.get(entity);
		expect(playerPosition).toBeDefined();
		expect(originalPosition).toBeDefined();
		if (playerPosition === undefined || originalPosition === undefined) return;

		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "move",
					entity,
					originalPosition,
					originalBody: crateBody,
					position: originalPosition,
				},
			}),
		);
		const moved = updateSystem.update(
			begun,
			Action.EditorEditSessionPreviewed({
				preview: { kind: "move", position: playerPosition },
			}),
		);
		const finished = updateSystem.update(
			moved,
			Action.EditorEditSessionCommitted(),
		);

		expect(finished.editor.invalidPlacement).toBeNull();
		expect(finished.positions.get(entity)).toEqual(playerPosition);
		const playing = updateSystem.update(finished, Action.EditorToggled());
		const relocatedPlayer = playing.positions.get(playerEntity);
		expect(playing.editor.open).toBe(false);
		expect(relocatedPlayer).toBeDefined();
		expect(relocatedPlayer).not.toEqual(playerPosition);
		if (relocatedPlayer === undefined) return;
		expect(
			isPlayerPlacementValid(playing, relocatedPlayer, groundElevation),
		).toBe(true);
	});

	test("updates the dead-zone camera after movement reaches a view edge", () => {
		const positions = new Map([
			[playerEntity, Position.make({ x: 1200, y: 320 })],
		]);
		const world = {
			...initialWorld,
			positions,
			bodies: new Map([[playerEntity, playerBody]]),
			obstacles: new Map(),
			decorations: new Map(),
			floorPlan: Body.make({ width: 2000, depth: 640 }),
			gameCamera: Position.make({ x: 0, y: 0 }),
			pressed: new Set<Direction>([Controls.Right]),
			lastFrame: 1000,
		};

		const moved = updateSystem.update(world, Action.Tick({ time: 1050 }));

		expect(moved.positions.get(playerEntity)?.x).toBe(1212.25);
		expect(moved.gameCamera.x).toBe(-152.25);
	});

	test("adds, resizes, moves, and deletes editor objects", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const added = updateSystem.update(
			editing,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Wall,
				position: Position.make({ x: 520, y: 260 }),
			}),
		);
		const entity = added.editor.selected;
		expect(entity).not.toBeNull();
		expect(entity).not.toBe("floor");
		if (entity === null || entity === "floor") return;

		expect(added.obstacles.get(entity)?.kind).toBe(ObstacleKinds.Wall);
		const resized = updateSystem.update(
			added,
			Action.EditorEntityResized({
				entity,
				body: Body.make({ width: 8, depth: 90 }),
			}),
		);
		expect(resized.bodies.get(entity)?.width).toBe(minimumEntityExtent);

		const moved = updateSystem.update(
			resized,
			Action.EditorEntityMoved({
				entity,
				position: Position.make({ x: 710, y: 410 }),
			}),
		);
		expect(moved.positions.get(entity)).toEqual({ x: 710, y: 410 });

		const deleted = updateSystem.update(moved, Action.EditorDeleteSelected());
		expect(deleted.positions.has(entity)).toBe(false);
		expect(deleted.bodies.has(entity)).toBe(false);
		expect(deleted.obstacles.has(entity)).toBe(false);
		expect(deleted.editor.selected).toBeNull();
	});

	test("adds chests and signs in the design studio", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const added = updateSystem.update(
			editing,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Chest,
				position: Position.make({ x: 100, y: 250 }),
			}),
		);
		const chest = added.editor.selected;
		expect(chest).not.toBeNull();
		expect(chest).not.toBe("floor");
		if (chest === null || chest === "floor") return;

		expect(added.obstacles.get(chest)?.kind).toBe(ObstacleKinds.Chest);
		expect(added.openedChests.has(chest)).toBe(false);

		const withSign = updateSystem.update(
			added,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Sign,
				position: Position.make({ x: 100, y: 400 }),
			}),
		);
		const sign = withSign.editor.selected;
		expect(sign).not.toBeNull();
		expect(sign).not.toBe("floor");
		if (sign === null || sign === "floor") return;
		expect(withSign.decorations.get(sign)?.kind).toBe(DecorationKinds.Sign);

		const withContent = updateSystem.update(
			withSign,
			Action.EditorSignContentChanged({
				entity: sign,
				content: {
					title: "Wayfinder",
					body: "Follow the lanterns to the village.",
				},
			}),
		);
		expect(withContent.signContents.get(sign)).toEqual({
			title: "Wayfinder",
			body: "Follow the lanterns to the village.",
		});
	});

	test("enforces the maximum bounds for every editor object kind", () => {
		const emptyLargeWorld: World = {
			...initialWorld,
			positions: new Map([[playerEntity, Position.make({ x: 100, y: 100 })]]),
			bodies: new Map([[playerEntity, playerBody]]),
			obstacles: new Map(),
			decorations: new Map(),
			floorPlan: Body.make({ width: 8000, depth: 8000 }),
		};

		for (const kind of Object.values(EditorItemKinds)) {
			const editing = updateSystem.update(
				emptyLargeWorld,
				Action.EditorToggled(),
			);
			const added = updateSystem.update(
				editing,
				Action.EditorItemAdded({
					kind,
					position: Position.make({ x: 4000, y: 4000 }),
				}),
			);
			const entity = added.editor.selected;
			expect(entity).not.toBeNull();
			expect(entity).not.toBe("floor");
			if (entity === null || entity === "floor") continue;

			const resized = updateSystem.update(
				added,
				Action.EditorEntityResized({
					entity,
					body: Body.make({ width: 9000, depth: 9000 }),
				}),
			);

			expect(resized.bodies.get(entity)).toEqual(maximumEditorItemBody(kind));
		}
	});

	test("places crates, plants, lamps, signs, and chests on platform tops", () => {
		const platformEntity = EntityId(780);
		for (const kind of [
			EditorItemKinds.Crate,
			EditorItemKinds.Plant,
			EditorItemKinds.Lamp,
			EditorItemKinds.Sign,
			EditorItemKinds.Chest,
		] as const) {
			const platformHeight = 50;
			const base: World = {
				...initialWorld,
				positions: new Map([
					[playerEntity, Position.make({ x: 100, y: 100 })],
					[platformEntity, Position.make({ x: 500, y: 400 })],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[platformEntity, Body.make({ width: 240, depth: 180 })],
				]),
				obstacles: new Map([
					[
						platformEntity,
						Obstacle.make({
							height: platformHeight,
							kind: ObstacleKinds.Platform,
						}),
					],
				]),
				decorations: new Map(),
			};
			const editing = updateSystem.update(base, Action.EditorToggled());
			const added = updateSystem.update(
				editing,
				Action.EditorItemAdded({
					kind,
					position: Position.make({ x: 500, y: 400 }),
				}),
			);
			const entity = added.editor.selected;
			expect(entity).not.toBeNull();
			expect(entity).not.toBe("floor");
			if (entity === null || entity === "floor") continue;

			expect(added.editor.invalidPlacement).toBeNull();
			expect(added.elevations.get(entity)?.z).toBe(platformHeight);

			const occupied = updateSystem.update(
				added,
				Action.EditorItemAdded({
					kind,
					position: Position.make({ x: 500, y: 400 }),
				}),
			);
			if (kind === EditorItemKinds.Crate) {
				const stackedEntity = occupied.editor.selected;
				expect(stackedEntity).not.toBeNull();
				expect(stackedEntity).not.toBe("floor");
				if (stackedEntity === null || stackedEntity === "floor") continue;
				expect(occupied.editor.invalidPlacement).toBeNull();
				expect(occupied.positions.size).toBe(added.positions.size + 1);
				expect(occupied.elevations.get(stackedEntity)?.z).toBe(
					platformHeight + crateHeight,
				);
			} else {
				expect(occupied.editor.invalidPlacement).toEqual({ kind: "new" });
				expect(occupied.positions.size).toBe(added.positions.size);
			}
		}
	});

	test("restores an occupied platform after a move and prevents deleting it", () => {
		const platformEntity = EntityId(785);
		const plantEntity = EntityId(786);
		const platformPosition = Position.make({ x: 500, y: 400 });
		const platformBody = Body.make({ width: 240, depth: 180 });
		const plantBody = Body.make({ width: 64, depth: 64 });
		const platformHeight = 50;
		const base: World = {
			...initialWorld,
			positions: new Map([
				[playerEntity, Position.make({ x: 100, y: 100 })],
				[platformEntity, platformPosition],
				[plantEntity, Position.make({ x: 500, y: 360 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[platformEntity, platformBody],
				[plantEntity, plantBody],
			]),
			obstacles: new Map([
				[
					platformEntity,
					Obstacle.make({
						height: platformHeight,
						kind: ObstacleKinds.Platform,
					}),
				],
			]),
			decorations: new Map([
				[
					plantEntity,
					Decoration.make({
						kind: DecorationKinds.Plant,
						height: 84,
					}),
				],
			]),
			elevations: new Map([
				[
					playerEntity,
					Elevation.make({
						z: groundElevation,
						velocity: stationaryVelocity,
					}),
				],
				[
					plantEntity,
					Elevation.make({
						z: platformHeight,
						velocity: stationaryVelocity,
					}),
				],
			]),
		};
		const editing = updateSystem.update(base, Action.EditorToggled());
		const moved = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "move",
					entity: platformEntity,
					position: Position.make({ x: 700, y: 400 }),
					originalPosition: platformPosition,
					originalBody: platformBody,
				},
			}),
		);
		const rejectedMove = updateSystem.update(
			moved,
			Action.EditorEditSessionCommitted(),
		);
		expect(rejectedMove.editor.editSession?.validity).toEqual({
			kind: "invalid",
			reason: "occupied-support",
		});

		const restored = updateSystem.update(
			rejectedMove,
			Action.EditorEditSessionCancelled(),
		);
		expect(restored.positions.get(platformEntity)).toEqual(platformPosition);
		expect(restored.elevations.get(plantEntity)?.z).toBe(platformHeight);

		const selected = updateSystem.update(
			restored,
			Action.EditorSelectionChanged({ selection: platformEntity }),
		);
		const rejectedDelete = updateSystem.update(
			selected,
			Action.EditorDeleteSelected(),
		);
		expect(rejectedDelete.positions.has(platformEntity)).toBe(true);
		expect(rejectedDelete.editor.invalidPlacement?.kind).toBe("entity");
	});

	test("clamps object heights and keeps supported objects on a resized platform", () => {
		const platformEntity = EntityId(790);
		const crateEntity = EntityId(791);
		const platformHeight = 40;
		const world: World = {
			...initialWorld,
			positions: new Map([
				[playerEntity, Position.make({ x: 100, y: 100 })],
				[platformEntity, Position.make({ x: 500, y: 400 })],
				[crateEntity, Position.make({ x: 500, y: 400 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[platformEntity, Body.make({ width: 240, depth: 180 })],
				[crateEntity, crateBody],
			]),
			obstacles: new Map([
				[
					platformEntity,
					Obstacle.make({
						height: platformHeight,
						kind: ObstacleKinds.Platform,
					}),
				],
				[
					crateEntity,
					Obstacle.make({
						height: crateHeight,
						kind: ObstacleKinds.Crate,
					}),
				],
			]),
			decorations: new Map(),
			elevations: new Map([
				[
					playerEntity,
					Elevation.make({
						z: groundElevation,
						velocity: stationaryVelocity,
					}),
				],
				[
					crateEntity,
					Elevation.make({
						z: platformHeight,
						velocity: stationaryVelocity,
					}),
				],
			]),
		};
		const editing = updateSystem.update(world, Action.EditorToggled());
		const resized = updateSystem.update(
			editing,
			Action.EditorEntityHeightChanged({
				entity: platformEntity,
				height: 1000,
			}),
		);
		const maximum = editorItemHeightLimits(EditorItemKinds.Platform).maximum;

		expect(resized.obstacles.get(platformEntity)?.height).toBe(maximum);
		expect(resized.elevations.get(crateEntity)?.z).toBe(maximum);
	});

	test("rejects an overlapping drag and restores its starting position", () => {
		const entity = crateEntities[0];
		const originalPosition = initialWorld.positions.get(entity);
		const otherPosition = Position.make({ x: 328, y: 600 });
		expect(originalPosition).toBeDefined();
		if (originalPosition === undefined) return;

		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const moved = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "move",
					entity,
					position: Position.make({ x: 500, y: 350 }),
					originalPosition,
					originalBody: crateBody,
				},
			}),
		);
		const invalidPreview = updateSystem.update(
			moved,
			Action.EditorEditSessionPreviewed({
				preview: { kind: "move", position: otherPosition },
			}),
		);
		const invalid = updateSystem.update(
			invalidPreview,
			Action.EditorEditSessionCommitted(),
		);

		expect(editSessionView(invalidPreview).positions.get(entity)).toEqual(
			otherPosition,
		);
		expect(invalidPreview.editor.invalidPlacement).toBeNull();
		expect(invalid.positions.get(entity)).toEqual(originalPosition);
		expect(invalid.editor.editSession?.validity).toEqual({
			kind: "invalid",
			reason: "overlaps-editor-item",
		});
		const restored = updateSystem.update(
			invalid,
			Action.EditorEditSessionCancelled(),
		);
		expect(restored.positions.get(entity)).toEqual(originalPosition);
		expect(restored.editor.invalidPlacement).toBeNull();
	});

	test("rejects an overlapping resize and restores its starting bounds", () => {
		const entity = crateEntities[0];
		const otherEntity = crateEntities[1];
		const originalPosition = Position.make({ x: 300, y: 300 });
		const originalBody = Body.make({ width: 40, depth: 40 });
		const editing = updateSystem.update(
			makeWorld({
				positions: new Map([
					[entity, originalPosition],
					[otherEntity, Position.make({ x: 400, y: 300 })],
				]),
				bodies: new Map([
					[entity, originalBody],
					[otherEntity, Body.make({ width: 40, depth: 40 })],
				]),
				obstacles: new Map([
					[
						entity,
						Obstacle.make({
							height: crateHeight,
							kind: ObstacleKinds.Crate,
						}),
					],
					[
						otherEntity,
						Obstacle.make({
							height: crateHeight,
							kind: ObstacleKinds.Crate,
						}),
					],
				]),
				pressed: new Set(),
				grabbed: null,
			}),
			Action.EditorToggled(),
		);
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "resize",
					entity,
					position: originalPosition,
					body: originalBody,
					originalPosition,
					originalBody,
				},
			}),
		);
		const validIntermediate = updateSystem.update(
			begun,
			Action.EditorEditSessionPreviewed({
				preview: {
					kind: "resize",
					position: Position.make({ x: 320, y: 300 }),
					body: Body.make({ width: 80, depth: 40 }),
				},
			}),
		);
		const invalidPreview = updateSystem.update(
			validIntermediate,
			Action.EditorEditSessionPreviewed({
				preview: {
					kind: "resize",
					position: Position.make({ x: 340, y: 300 }),
					body: Body.make({ width: 120, depth: 40 }),
				},
			}),
		);
		const invalid = updateSystem.update(
			invalidPreview,
			Action.EditorEditSessionCommitted(),
		);

		expect(editSessionView(invalidPreview).positions.get(entity)).toEqual({
			x: 340,
			y: 300,
		});
		expect(editSessionView(invalidPreview).bodies.get(entity)).toEqual({
			width: 120,
			depth: 40,
		});
		expect(invalidPreview.editor.invalidPlacement).toBeNull();
		expect(invalid.editor.editSession?.validity.kind).toBe("invalid");
		const restored = updateSystem.update(
			invalid,
			Action.EditorEditSessionCancelled(),
		);
		expect(restored.positions.get(entity)).toEqual(originalPosition);
		expect(restored.bodies.get(entity)).toEqual(originalBody);
		expect(restored.editor.invalidPlacement).toBeNull();
	});

	test("does not add an out-of-bounds item", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const result = updateSystem.update(
			editing,
			Action.EditorItemAdded({
				kind: EditorItemKinds.Plant,
				position: Position.make({ x: 10, y: 10 }),
			}),
		);

		expect(result.positions.size).toBe(editing.positions.size);
		expect(result.editor.invalidPlacement).toEqual({ kind: "new" });
	});

	test("expands left and up without translating authored content or compensating the camera", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const entity = crateEntities[0];
		const originalPosition = editing.positions.get(entity);
		const originalTiles = editing.floorTiles;
		expect(originalPosition).toBeDefined();
		if (originalPosition === undefined) return;
		const floorOrigin = Position.make({ x: -100, y: -40 });
		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "resize-floor",
					floorPlan: editing.floorPlan,
					floorOrigin: editing.floorOrigin,
				},
			}),
		);
		const preview = updateSystem.update(
			begun,
			Action.EditorEditSessionPreviewed({
				preview: {
					kind: "resize-floor",
					floorPlan: Body.make({
						width: editing.floorPlan.width + 100,
						depth: editing.floorPlan.depth + 40,
					}),
					floorOrigin,
				},
			}),
		);

		const view = editSessionView(preview);
		expect({
			floorOrigin:
				"floorOrigin" in view
					? (view as World & { readonly floorOrigin: Position }).floorOrigin
					: null,
			position: view.positions.get(entity),
			camera: preview.editor.camera,
		}).toEqual({
			floorOrigin,
			position: originalPosition,
			camera: editing.editor.camera,
		});
		expect(
			originalTiles.every((tile) =>
				editSessionView(preview).floorTiles.includes(tile),
			),
		).toBe(true);
		expect(
			editSessionView(preview).floorTiles.some(
				(tile) => tile.column < 0 || tile.row < 0,
			),
		).toBe(true);
		const finished = updateSystem.update(
			preview,
			Action.EditorEditSessionCommitted(),
		);
		expect(finished.floorPlan).toEqual({
			width: editing.floorPlan.width + 100,
			depth: editing.floorPlan.depth + 40,
		});
		expect(finished.floorTileOrigin).toEqual({ x: 0, y: 0 });
		expect(finished.editor.invalidPlacement).toBeNull();
	});

	test("does not impose an arbitrary maximum floor extent", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const expanded = updateSystem.update(
			editing,
			Action.EditorFloorResized({
				floorPlan: Body.make({ width: 8_100, depth: 8_100 }),
			}),
		);

		expect(expanded.floorPlan).toEqual({ width: 8_100, depth: 8_100 });
	});

	test("rejects a floor resize that excludes objects after release", () => {
		const editing = updateSystem.update(initialWorld, Action.EditorToggled());
		const floorOrigin = Position.make({ x: 100, y: 60 });

		const begun = updateSystem.update(
			editing,
			Action.EditorEditSessionBegan({
				operation: {
					kind: "resize-floor",
					floorPlan: editing.floorPlan,
					floorOrigin: editing.floorOrigin,
				},
			}),
		);
		const preview = updateSystem.update(
			begun,
			Action.EditorEditSessionPreviewed({
				preview: {
					kind: "resize-floor",
					floorPlan: Body.make({
						width: minimumFloorWidth,
						depth: minimumFloorDepth,
					}),
					floorOrigin,
				},
			}),
		);
		const invalid = updateSystem.update(
			preview,
			Action.EditorEditSessionCommitted(),
		);

		expect(editSessionView(preview).floorPlan).toEqual({
			width: minimumFloorWidth,
			depth: minimumFloorDepth,
		});
		expect(preview.editor.invalidPlacement).toBeNull();
		expect(invalid.editor.editSession?.validity).toEqual({
			kind: "invalid",
			reason: "floor-excludes-editor-item",
		});
		const restored = updateSystem.update(
			invalid,
			Action.EditorEditSessionCancelled(),
		);
		expect(restored.floorPlan).toEqual(editing.floorPlan);
		expect(restored.positions.get(playerEntity)).toEqual(
			editing.positions.get(playerEntity),
		);
		expect(restored.editor.camera).toEqual(editing.editor.camera);
		expect(restored.editor.invalidPlacement).toBeNull();
	});
});
