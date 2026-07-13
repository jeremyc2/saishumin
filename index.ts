import { Data, Effect, ManagedRuntime, Queue, Ref, Stream } from "effect";
import "./index.css";
import { html, render, svg } from "lit-html";
import { run } from "otaku-hmr";
import { State } from "otaku-state";

type Entity = number;
type Direction = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

type Position = { readonly x: number; readonly y: number };
type Body = { readonly width: number; readonly height: number };
type Player = { readonly speed: number; readonly color: string };
type Decoration =
	| { readonly kind: "rug"; readonly fill: string }
	| { readonly kind: "table"; readonly fill: string }
	| { readonly kind: "plant"; readonly fill: string }
	| { readonly kind: "sofa"; readonly fill: string };

type World = {
	readonly positions: ReadonlyMap<Entity, Position>;
	readonly bodies: ReadonlyMap<Entity, Body>;
	readonly players: ReadonlyMap<Entity, Player>;
	readonly solid: ReadonlySet<Entity>;
	readonly decorations: ReadonlyMap<Entity, Decoration>;
	readonly pressed: ReadonlySet<Direction>;
	readonly lastFrame: number;
};

type Action = Data.TaggedEnum<{
	KeyChanged: { readonly key: Direction; readonly pressed: boolean };
	Tick: { readonly time: number };
}>;

const Action = Data.taggedEnum<Action>();

const playerEntity = 1;
const wallEntity = 100;
const roomWidth = 1600;
const roomHeight = 900;

const positions = new Map<Entity, Position>([
	[playerEntity, { x: 300, y: 450 }],
	[wallEntity, { x: 800, y: 45 }],
	[wallEntity + 1, { x: 800, y: 855 }],
	[wallEntity + 2, { x: 45, y: 450 }],
	[wallEntity + 3, { x: 1555, y: 450 }],
	[wallEntity + 4, { x: 730, y: 240 }],
	[wallEntity + 5, { x: 1110, y: 240 }],
	[wallEntity + 6, { x: 920, y: 560 }],
	[wallEntity + 7, { x: 920, y: 790 }],
	[wallEntity + 8, { x: 1280, y: 650 }],
	[wallEntity + 9, { x: 1280, y: 790 }],
	[10, { x: 430, y: 600 }],
	[11, { x: 1230, y: 430 }],
	[12, { x: 250, y: 210 }],
	[13, { x: 1380, y: 220 }],
	[14, { x: 1450, y: 720 }],
]);

const bodies = new Map<Entity, Body>([
	[playerEntity, { width: 53, height: 53 }],
	[wallEntity, { width: 1540, height: 30 }],
	[wallEntity + 1, { width: 1540, height: 30 }],
	[wallEntity + 2, { width: 30, height: 840 }],
	[wallEntity + 3, { width: 30, height: 840 }],
	[wallEntity + 4, { width: 40, height: 300 }],
	[wallEntity + 5, { width: 40, height: 300 }],
	[wallEntity + 6, { width: 40, height: 230 }],
	[wallEntity + 7, { width: 40, height: 110 }],
	[wallEntity + 8, { width: 40, height: 140 }],
	[wallEntity + 9, { width: 40, height: 110 }],
]);

const initialWorld: World = {
	positions,
	bodies,
	players: new Map([[playerEntity, { speed: 260, color: "#f6b75b" }]]),
	solid: new Set([
		wallEntity,
		wallEntity + 1,
		wallEntity + 2,
		wallEntity + 3,
		wallEntity + 4,
		wallEntity + 5,
		wallEntity + 6,
		wallEntity + 7,
		wallEntity + 8,
		wallEntity + 9,
	]),
	decorations: new Map([
		[10, { kind: "rug", fill: "#af5f47" }],
		[11, { kind: "table", fill: "#6e4538" }],
		[12, { kind: "sofa", fill: "#527b7b" }],
		[13, { kind: "sofa", fill: "#527b7b" }],
		[14, { kind: "plant", fill: "#527a55" }],
	]),
	pressed: new Set(),
	lastFrame: 0,
};

const isDirection = (key: string): key is Direction =>
	key === "ArrowUp" ||
	key === "ArrowDown" ||
	key === "ArrowLeft" ||
	key === "ArrowRight";

const overlaps = (
	position: Position,
	body: Body,
	obstaclePosition: Position,
	obstacle: Body,
): boolean =>
	Math.abs(position.x - obstaclePosition.x) <
		(body.width + obstacle.width) / 2 &&
	Math.abs(position.y - obstaclePosition.y) <
		(body.height + obstacle.height) / 2;

const canOccupy = (
	world: World,
	entity: Entity,
	position: Position,
): boolean => {
	const body = world.bodies.get(entity);
	if (body === undefined) return false;

	for (const obstacleEntity of world.solid) {
		if (obstacleEntity === entity) continue;
		const obstaclePosition = world.positions.get(obstacleEntity);
		const obstacle = world.bodies.get(obstacleEntity);
		if (
			obstaclePosition !== undefined &&
			obstacle !== undefined &&
			overlaps(position, body, obstaclePosition, obstacle)
		) {
			return false;
		}
	}
	return true;
};

const movementSystem = (world: World, elapsed: number): World => {
	const player = world.players.get(playerEntity);
	const position = world.positions.get(playerEntity);
	if (
		player === undefined ||
		position === undefined ||
		world.pressed.size === 0
	)
		return world;

	const horizontal =
		Number(world.pressed.has("ArrowRight")) -
		Number(world.pressed.has("ArrowLeft"));
	const vertical =
		Number(world.pressed.has("ArrowDown")) -
		Number(world.pressed.has("ArrowUp"));
	const magnitude = Math.hypot(horizontal, vertical);
	if (magnitude === 0) return world;

	const distance = (player.speed * elapsed) / magnitude;
	const horizontalCandidate = {
		x: position.x + horizontal * distance,
		y: position.y,
	};
	const verticalCandidate = {
		x: canOccupy(world, playerEntity, horizontalCandidate)
			? horizontalCandidate.x
			: position.x,
		y: position.y + vertical * distance,
	};
	const nextPosition = {
		x: verticalCandidate.x,
		y: canOccupy(world, playerEntity, verticalCandidate)
			? verticalCandidate.y
			: position.y,
	};

	if (nextPosition.x === position.x && nextPosition.y === position.y)
		return world;
	const nextPositions = new Map(world.positions);
	nextPositions.set(playerEntity, nextPosition);
	return { ...world, positions: nextPositions };
};

const updateSystem = (world: World, action: Action): World =>
	Action.$match(action, {
		KeyChanged: ({ key, pressed }) => {
			const nextPressed = new Set(world.pressed);
			if (pressed) nextPressed.add(key);
			else nextPressed.delete(key);
			return { ...world, pressed: nextPressed };
		},
		Tick: ({ time }) => {
			if (world.lastFrame === 0) return { ...world, lastFrame: time };
			const elapsed = Math.min((time - world.lastFrame) / 1000, 0.05);
			return { ...movementSystem(world, elapsed), lastFrame: time };
		},
	});

const wallTemplate = (position: Position, body: Body) => svg`
	<rect
		class="fill-[#314d57]"
		x=${position.x - body.width / 2}
		y=${position.y - body.height / 2}
		width=${body.width}
		height=${body.height}
	/>
`;

const decorationTemplate = (position: Position, decoration: Decoration) => {
	switch (decoration.kind) {
		case "rug":
			return svg`<rect class="stroke-[#e4ae70] stroke-8" x=${position.x - 180} y=${position.y - 105} width="360" height="210" rx="28" fill=${decoration.fill} />`;
		case "table":
			return svg`<ellipse class="stroke-[#392b2b] stroke-8" cx=${position.x} cy=${position.y} rx="125" ry="72" fill=${decoration.fill} />`;
		case "sofa":
			return svg`<rect class="stroke-[#392b2b] stroke-8" x=${position.x - 105} y=${position.y - 42} width="210" height="84" rx="18" fill=${decoration.fill} />`;
		case "plant":
			return svg`<g transform="translate(${position.x} ${position.y})"><circle r="42" fill="#d5a56c" /><circle cy="-19" r="37" fill=${decoration.fill} /><circle cx="-27" cy="5" r="25" fill=${decoration.fill} /><circle cx="27" cy="5" r="25" fill=${decoration.fill} /></g>`;
	}
};

const renderSystem = (world: World): void => {
	const playerPosition = world.positions.get(playerEntity);
	const player = world.players.get(playerEntity);
	if (playerPosition === undefined || player === undefined) return;

	const walls = [...world.solid].flatMap((entity) => {
		const position = world.positions.get(entity);
		const body = world.bodies.get(entity);
		return position === undefined || body === undefined
			? []
			: [wallTemplate(position, body)];
	});
	const decorations = [...world.decorations].flatMap(([entity, decoration]) => {
		const position = world.positions.get(entity);
		return position === undefined
			? []
			: [decorationTemplate(position, decoration)];
	});

	render(
		html`
			<svg class="block h-screen w-screen bg-[#18232b]" viewBox="0 0 ${roomWidth} ${roomHeight}" role="img" aria-label="Top-down room exploration game">
				<defs>
					<pattern id="floor-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#8d8068" stroke-width="2" /></pattern>
				</defs>
				<rect class="fill-[#c8b28b]" x="60" y="60" width="1480" height="780" />
				<rect x="60" y="60" width="1480" height="780" fill="url(#floor-grid)" opacity=".4" />
				<text class="fill-[#3b3027] text-[20px] font-bold tracking-[0.15em]" x="250" y="140">LOUNGE</text>
				<text class="fill-[#3b3027] text-[20px] font-bold tracking-[0.15em]" x="1220" y="140">READING ROOM</text>
				<text class="fill-[#3b3027] text-[20px] font-bold tracking-[0.15em]" x="1050" y="740">STUDIO</text>
				${decorations}
				${walls}
				<ellipse cx=${playerPosition.x} cy=${playerPosition.y + 24} rx="25" ry="10" fill="#675b4c" opacity=".3" />
				<circle class="stroke-[#503b37] stroke-7" cx=${playerPosition.x} cy=${playerPosition.y} r="23" fill=${player.color} />
				<circle cx=${playerPosition.x - 8} cy=${playerPosition.y - 5} r="4" fill="#382c31" />
				<circle cx=${playerPosition.x + 8} cy=${playerPosition.y - 5} r="4" fill="#382c31" />
				<path d="M ${playerPosition.x - 9} ${playerPosition.y + 9} Q ${playerPosition.x} ${playerPosition.y + 15} ${playerPosition.x + 9} ${playerPosition.y + 9}" fill="none" stroke="#382c31" stroke-width="3" stroke-linecap="round" />
				<text class="fill-[#f8ead2] text-[26px] font-bold tracking-[0.08em]" x="95" y="110">SAISHUMIN</text>
				<text class="fill-[#e3cfac] text-[19px]" x="95" y="790">ARROW KEYS · EXPLORE THE HOUSE</text>
			</svg>
		`,
		document.body,
	);
};

document.body.className =
	"m-0 overflow-hidden bg-[#18232b] font-sans scheme-dark";

const runtime = ManagedRuntime.make(State.layer);

const program = Effect.gen(function* () {
	const state = yield* State;
	const world = yield* state.make({
		key: "saishumin/ecs-world",
		initial: initialWorld,
	});
	const actions = yield* Queue.unbounded<Action>();
	const dispatch = (action: Action): void => {
		runtime.runFork(Queue.offer(actions, action));
	};

	window.addEventListener("keydown", (event) => {
		if (!isDirection(event.key)) return;
		event.preventDefault();
		dispatch(Action.KeyChanged({ key: event.key, pressed: true }));
	});
	window.addEventListener("keyup", (event) => {
		if (!isDirection(event.key)) return;
		event.preventDefault();
		dispatch(Action.KeyChanged({ key: event.key, pressed: false }));
	});
	window.addEventListener("blur", () => {
		for (const key of [
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight",
		] as const) {
			dispatch(Action.KeyChanged({ key, pressed: false }));
		}
	});

	const frame = (time: number): void => {
		dispatch(Action.Tick({ time }));
		window.requestAnimationFrame(frame);
	};
	window.requestAnimationFrame(frame);

	renderSystem(yield* Ref.get(world));
	yield* Stream.fromQueue(actions).pipe(
		Stream.runForEach((action) =>
			Effect.gen(function* () {
				yield* Ref.update(world, (current) => updateSystem(current, action));
				renderSystem(yield* Ref.get(world));
			}),
		),
	);
});

run(runtime, program);
