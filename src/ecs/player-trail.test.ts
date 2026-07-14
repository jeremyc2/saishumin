import { describe, expect, test } from "bun:test";
import {
	Body,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../model/component";
import { EntityId } from "../model/entity-id";
import { PlayerFacings } from "../model/player-facing";
import {
	type PlayerTrailMark,
	playerTireTrackFade,
	playerTrailLifetimeSeconds,
} from "../model/player-trail";
import { advancePlayerTrail } from "./player-trail";
import {
	groundElevation,
	initialWorld,
	playerEntity,
	stationaryVelocity,
	type World,
} from "./world";

const worldAt = (
	x: number,
	y: number,
	options: {
		readonly trail?: ReadonlyArray<PlayerTrailMark>;
		readonly z?: number;
		readonly velocity?: number;
	} = {},
): World => ({
	...initialWorld,
	positions: new Map(initialWorld.positions).set(
		playerEntity,
		Position.make({ x, y }),
	),
	elevations: new Map(initialWorld.elevations).set(
		playerEntity,
		Elevation.make({
			z: options.z ?? groundElevation,
			velocity: options.velocity ?? stationaryVelocity,
		}),
	),
	obstacles: new Map(),
	decorations: new Map(),
	playerFacing: PlayerFacings.Right,
	playerTrail: options.trail ?? [],
});

describe("advancePlayerTrail", () => {
	test("emits closely spaced track marks during grounded movement", () => {
		const first = advancePlayerTrail(
			worldAt(300, 300),
			worldAt(310, 300),
			0.05,
		);
		const second = advancePlayerTrail(
			first,
			worldAt(330, 300, {
				trail: first.playerTrail,
			}),
			0.05,
		);

		expect(first.playerTrail).toHaveLength(1);
		expect(first.playerTrail[0]?.position).toEqual({ x: 310, y: 300 });
		expect(second.playerTrail).toHaveLength(2);
	});

	test("does not leave marks while airborne", () => {
		const airborne = advancePlayerTrail(
			worldAt(300, 300),
			worldAt(310, 300, { z: 20, velocity: 100 }),
			0.05,
		);

		expect(airborne.playerTrail).toEqual([]);
	});

	test("removes marks after the configured lifetime", () => {
		const mark: PlayerTrailMark = {
			position: Position.make({ x: 280, y: 300 }),
			elevation: groundElevation,
			supportEntity: null,
			facing: PlayerFacings.Right,
			age: playerTrailLifetimeSeconds - 0.01,
		};
		const standing = worldAt(300, 300, { trail: [mark] });

		expect(advancePlayerTrail(standing, standing, 0.02).playerTrail).toEqual(
			[],
		);
	});

	test("remembers the raised surface supporting an overhanging player", () => {
		const wall = EntityId(990);
		const onWall = (x: number): World => {
			const base = worldAt(x, 300, { z: 80 });
			return {
				...base,
				positions: new Map(base.positions).set(
					wall,
					Position.make({ x: 300, y: 300 }),
				),
				bodies: new Map(base.bodies).set(
					wall,
					Body.make({ width: 36, depth: 180 }),
				),
				obstacles: new Map(base.obstacles).set(
					wall,
					Obstacle.make({ kind: ObstacleKinds.Wall, height: 80 }),
				),
			};
		};

		const moved = advancePlayerTrail(onWall(300), onWall(318), 0.05);

		expect(moved.playerTrail[0]?.supportEntity).toBe(wall);
		expect(moved.playerTrail[0]?.elevation).toBe(80);
	});

	test("fades slowly at both ends with a near-linear middle", () => {
		const atProgress = (progress: number): number =>
			playerTireTrackFade(playerTrailLifetimeSeconds * progress);
		const earlyChange = atProgress(0) - atProgress(0.1);
		const middleChange = atProgress(0.45) - atProgress(0.55);
		const lateChange = atProgress(0.9) - atProgress(1);

		expect(atProgress(0)).toBe(1);
		expect(atProgress(0.5)).toBe(0.5);
		expect(atProgress(1)).toBe(0);
		expect(earlyChange).toBeLessThan(middleChange);
		expect(lateChange).toBeLessThan(middleChange);
	});
});
