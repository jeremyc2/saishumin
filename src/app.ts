import { Effect, Layer, ManagedRuntime, Queue, Ref, Stream } from "effect";
import { run } from "otaku-hmr";
import { State } from "otaku-state";
import { reconcileWorld } from "./ecs/reconcile-world";
import { initialWorld } from "./ecs/world";
import { Action } from "./model/action";
import { Controls, isControl } from "./model/control";
import { MovementSystemService } from "./systems/movement-system-service";
import { RenderSystemService } from "./systems/render-system-service";
import { UpdateSystemService } from "./systems/update-system-service";

document.body.className =
	"m-0 overflow-hidden bg-[#14212a] font-sans scheme-dark";

const updateSystemLayer = UpdateSystemService.layer.pipe(
	Layer.provide(MovementSystemService.layer),
);
const applicationLayer = Layer.mergeAll(
	State.layer,
	updateSystemLayer,
	RenderSystemService.layer,
);
const runtime = ManagedRuntime.make(applicationLayer);

const program = Effect.gen(function* () {
	const state = yield* State;
	const updateSystem = yield* UpdateSystemService;
	const renderSystem = yield* RenderSystemService;
	const world = yield* state.make({
		key: "saishumin/world-v3",
		initial: initialWorld,
	});
	yield* Ref.update(world, reconcileWorld);
	const actions = yield* Queue.unbounded<Action>();
	const dispatch = (action: Action): void => {
		runtime.runFork(Queue.offer(actions, action));
	};

	window.addEventListener("keydown", (event) => {
		const key = event.key === "X" ? Controls.Interact : event.key;
		if (!isControl(key)) return;
		event.preventDefault();
		if (event.repeat && (key === Controls.Jump || key === Controls.Interact))
			return;
		dispatch(Action.KeyChanged({ key, pressed: true }));
	});
	window.addEventListener("keyup", (event) => {
		const key = event.key === "X" ? Controls.Interact : event.key;
		if (!isControl(key)) return;
		event.preventDefault();
		dispatch(Action.KeyChanged({ key, pressed: false }));
	});
	window.addEventListener("blur", () => {
		for (const key of [
			Controls.Up,
			Controls.Down,
			Controls.Left,
			Controls.Right,
			Controls.Grab,
		] as const) {
			dispatch(Action.KeyChanged({ key, pressed: false }));
		}
	});

	const frame = (time: number): void => {
		dispatch(Action.Tick({ time }));
		window.requestAnimationFrame(frame);
	};
	window.requestAnimationFrame(frame);

	renderSystem.render(yield* Ref.get(world), dispatch);
	yield* Stream.fromQueue(actions).pipe(
		Stream.runForEach((action) =>
			Effect.gen(function* () {
				const current = yield* Ref.get(world);
				const next = updateSystem.update(current, action);
				yield* Ref.set(world, next);
				if (
					next.positions !== current.positions ||
					next.elevations !== current.elevations ||
					next.bodies !== current.bodies ||
					next.obstacles !== current.obstacles ||
					next.decorations !== current.decorations ||
					next.floorPlan !== current.floorPlan ||
					next.gameCamera !== current.gameCamera ||
					next.editor !== current.editor ||
					next.playerFacing !== current.playerFacing ||
					next.playerTrail !== current.playerTrail ||
					next.openedChests !== current.openedChests ||
					next.signContents !== current.signContents ||
					next.readingSign !== current.readingSign ||
					next.grabbed !== current.grabbed
				)
					renderSystem.render(next, dispatch);
			}),
		),
	);
});

run(runtime, program);
