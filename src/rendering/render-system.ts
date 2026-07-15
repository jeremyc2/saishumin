import { Context, Effect, Layer } from "effect";
import { html, render } from "lit-html";
import type { EditSessionPresentation } from "../design-studio/edit-session/edit-session";
import { makeDesignStudioInteractionRuntime } from "../design-studio/interaction/runtime";
import { makeDesignStudioView } from "../design-studio/view/view";
import type { Action } from "../model/action";
import { playerEntity, type World } from "../world/world";
import { gameSceneTemplate } from "./internal/game-scene";

type Dispatch = (action: Action) => void;

export class RenderSystem extends Context.Service<
	RenderSystem,
	{
		readonly render: (
			authoredWorld: World,
			viewWorld: World,
			presentation: EditSessionPresentation,
			dispatch: Dispatch,
		) => void;
	}
>()("saishumin/rendering/render-system/RenderSystem") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			let currentWorld: World | undefined;
			let currentViewWorld: World | undefined;
			let currentPresentation: EditSessionPresentation | undefined;
			let currentDispatch: Dispatch | undefined;
			let designStudioView:
				| import("../design-studio/view/view").DesignStudioView
				| undefined;

			const renderWorld = (
				authoredWorld: World,
				viewWorld: World,
				presentation: EditSessionPresentation,
				dispatch: Dispatch,
			): void => {
				if (designStudioView === undefined) return;
				currentWorld = authoredWorld;
				currentViewWorld = viewWorld;
				currentPresentation = presentation;
				currentDispatch = dispatch;
				interactionRuntime.update(authoredWorld, dispatch);
				if (
					viewWorld.positions.get(playerEntity) === undefined ||
					viewWorld.elevations.get(playerEntity) === undefined
				)
					return;
				render(
					gameSceneTemplate({
						world: viewWorld,
						presentation,
						dispatch,
						interactionRuntime,
						designStudioView,
						onRootPointerDown: (event) => {
							const target = event.target;
							if (
								target instanceof Element &&
								target.closest("[data-palette-item]") !== null
							)
								return;
							interactionRuntime.dismissPalettePopover();
						},
					}),
					document.body,
				);
			};

			const refreshCreatePreview = (): void => {
				const world = currentWorld;
				if (world === undefined || designStudioView === undefined) return;
				const host = document.querySelector("#editor-create-preview-host");
				if (!(host instanceof HTMLElement)) return;
				const preview = interactionRuntime.createPreview();
				render(
					preview === null
						? html``
						: designStudioView.createPreviewTemplate(
								world,
								currentPresentation?.invalidPreview === true,
							),
					host,
				);
			};
			const refreshLocalState = (): void => {
				if (
					currentWorld !== undefined &&
					currentViewWorld !== undefined &&
					currentPresentation !== undefined &&
					currentDispatch !== undefined
				)
					renderWorld(
						currentWorld,
						currentViewWorld,
						currentPresentation,
						currentDispatch,
					);
			};
			const interactionRuntime = yield* makeDesignStudioInteractionRuntime({
				refresh: refreshLocalState,
				refreshPreview: refreshCreatePreview,
			});
			designStudioView = makeDesignStudioView(interactionRuntime);
			return { render: renderWorld };
		}),
	);
}
