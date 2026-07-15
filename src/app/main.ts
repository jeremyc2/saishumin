import { Effect, Layer, ManagedRuntime, Queue, Ref, Stream } from "effect";
import { run } from "otaku-hmr";
import { State } from "otaku-state";
import {
	editSessionPresentation,
	editSessionView,
} from "../design-studio/edit-session/edit-session";
import { MovementSystemService } from "../gameplay/movement/movement-system";
import { UpdateSystemService } from "../gameplay/update/update-system";
import { RenderSystem } from "../rendering/render-system";
import { initialWorld } from "../world/initial-world";
import { reconcileWorld } from "../world/reconcile-world";
import { Action } from "./action";
import { type Control, Controls, controlForKey } from "./control";

document.body.className =
	"m-0 overflow-hidden bg-[#14212a] font-sans scheme-dark";

const updateSystemLayer = UpdateSystemService.layer.pipe(
	Layer.provide(MovementSystemService.layer),
);
const applicationLayer = Layer.mergeAll(
	State.layer,
	updateSystemLayer,
	RenderSystem.layer,
);
const runtime = ManagedRuntime.make(applicationLayer);

const heldControlsByKey = new Map<string, Control>();

const program = Effect.gen(function* () {
	const state = yield* State;
	const updateSystem = yield* UpdateSystemService;
	const renderSystem = yield* RenderSystem;
	const world = yield* state.make({
		key: "saishumin/world-v3",
		initial: initialWorld,
	});
	yield* Ref.update(world, reconcileWorld);
	const actions = yield* Queue.unbounded<Action>();
	const dispatch = (action: Action): void => {
		runtime.runFork(Queue.offer(actions, action));
	};

	const changeKey = (event: KeyboardEvent, pressed: boolean): void => {
		const control = controlForKey(event.key);
		if (control === undefined) return;
		event.preventDefault();
		if (pressed) {
			if (heldControlsByKey.has(event.code)) return;
			const wasHeld = [...heldControlsByKey.values()].includes(control);
			heldControlsByKey.set(event.code, control);
			if (!wasHeld)
				dispatch(Action.KeyChanged({ key: control, pressed: true }));
			return;
		}
		const heldControl = heldControlsByKey.get(event.code);
		if (heldControl === undefined) return;
		heldControlsByKey.delete(event.code);
		if (![...heldControlsByKey.values()].includes(heldControl))
			dispatch(Action.KeyChanged({ key: heldControl, pressed: false }));
	};
	const onKeyDown = (event: KeyboardEvent): void => {
		changeKey(event, true);
	};
	const onKeyUp = (event: KeyboardEvent): void => {
		changeKey(event, false);
	};
	const onBlur = (): void => {
		heldControlsByKey.clear();
		for (const key of [
			Controls.Up,
			Controls.Down,
			Controls.Left,
			Controls.Right,
			Controls.Grab,
		] as const) {
			dispatch(Action.KeyChanged({ key, pressed: false }));
		}
	};

	let animationFrame: number | undefined;
	const frame = (time: number): void => {
		dispatch(Action.Tick({ time }));
		animationFrame = window.requestAnimationFrame(frame);
	};

	const initial = yield* Ref.get(world);
	renderSystem.render(
		initial,
		editSessionView(initial),
		editSessionPresentation(initial),
		dispatch,
	);
	yield* Effect.acquireUseRelease(
		Effect.sync(() => {
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			window.addEventListener("blur", onBlur);
			animationFrame = window.requestAnimationFrame(frame);
		}),
		() =>
			Stream.fromQueue(actions).pipe(
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
							next.floorOrigin !== current.floorOrigin ||
							next.floorTiles !== current.floorTiles ||
							next.floorTileOrigin !== current.floorTileOrigin ||
							next.gameCamera !== current.gameCamera ||
							next.editor !== current.editor ||
							next.playerFacing !== current.playerFacing ||
							next.lavaMonsterFacing !== current.lavaMonsterFacing ||
							next.openedChests !== current.openedChests ||
							next.signContents !== current.signContents ||
							next.readingSign !== current.readingSign ||
							next.grabbed !== current.grabbed
						)
							renderSystem.render(
								next,
								editSessionView(next),
								editSessionPresentation(next),
								dispatch,
							);
					}),
				),
			),
		() =>
			Effect.sync(() => {
				window.removeEventListener("keydown", onKeyDown);
				window.removeEventListener("keyup", onKeyUp);
				window.removeEventListener("blur", onBlur);
				if (animationFrame !== undefined)
					window.cancelAnimationFrame(animationFrame);
				heldControlsByKey.clear();
			}),
	);
});

run(runtime, program);
