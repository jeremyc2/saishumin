import { Context, Effect, Layer } from "effect";
import { html, render } from "lit-html";
import type { Action } from "../app/action";
import { EditSessionStatus } from "../design-studio/edit-session/edit-session";
import {
	type DesignStudioInteraction,
	makeDesignStudioInteraction,
} from "../design-studio/interaction/interaction";
import {
	type DesignStudioView,
	makeDesignStudioView,
} from "../design-studio/view/view";
import type { World } from "../world/world";
import { gameSceneTemplate } from "./internal/game-scene";

type Dispatch = (action: Action) => void;

type RenderInput = {
	readonly world: World;
	readonly previewWorld: World;
	readonly editSessionStatus: EditSessionStatus;
	readonly dispatch: Dispatch;
};

export class RenderSystem extends Context.Service<
	RenderSystem,
	{
		readonly render: (input: RenderInput) => void;
	}
>()("saishumin/rendering/render-system/RenderSystem") {
	static readonly layer = Layer.effect(this)(
		Effect.gen(function* () {
			let currentWorld: World | undefined;
			let currentPreviewWorld: World | undefined;
			let currentEditSessionStatus: EditSessionStatus | undefined;
			let currentDispatch: Dispatch | undefined;
			let designStudioView: DesignStudioView | undefined;
			let interaction: DesignStudioInteraction | undefined;

			const renderWorld = ({
				world,
				previewWorld,
				editSessionStatus,
				dispatch,
			}: RenderInput): void => {
				if (designStudioView === undefined || interaction === undefined) return;
				const activeInteraction = interaction;
				const view = designStudioView;
				currentWorld = world;
				currentPreviewWorld = previewWorld;
				currentEditSessionStatus = editSessionStatus;
				currentDispatch = dispatch;
				activeInteraction.update(world, dispatch);
				render(
					gameSceneTemplate({
						world: previewWorld,
						editSessionStatus,
						dispatch,
						interaction: activeInteraction,
						designStudioView: view,
						onRootPointerDown: (event) => {
							const target = event.target;
							if (
								target instanceof Element &&
								target.closest("[data-palette-item]") !== null
							)
								return;
							activeInteraction.dismissPalettePopover();
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
				const preview = interaction?.createPreview();
				render(
					preview == null
						? html``
						: designStudioView.createPreviewTemplate(
								world,
								EditSessionStatus.$is("InvalidPreview")(
									currentEditSessionStatus,
								) ||
									EditSessionStatus.$is("InvalidReleased")(
										currentEditSessionStatus,
									),
							),
					host,
				);
			};
			const refreshLocalState = (): void => {
				if (
					currentWorld !== undefined &&
					currentPreviewWorld !== undefined &&
					currentEditSessionStatus !== undefined &&
					currentDispatch !== undefined
				)
					renderWorld({
						world: currentWorld,
						previewWorld: currentPreviewWorld,
						editSessionStatus: currentEditSessionStatus,
						dispatch: currentDispatch,
					});
			};
			interaction = yield* makeDesignStudioInteraction({
				refresh: refreshLocalState,
				refreshPreview: refreshCreatePreview,
			});
			designStudioView = makeDesignStudioView(interaction);
			return { render: renderWorld };
		}),
	);
}
