import { html, type TemplateResult } from "lit-html";
import { Action, type Action as AppAction } from "../../model/action";
import {
	DecorationKinds,
	defaultSignContent,
	ObstacleKinds,
} from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import {
	minimumEntityExtent,
	minimumFloorDepth,
	minimumFloorWidth,
	type World,
} from "../../world/world";
import {
	editorEntityHeight,
	editorEntityHeightLimits,
	maximumEditorBody,
} from "../edit-session/edit-session";
import type { DesignStudioInteractionRuntime } from "../interaction/runtime";
import { type EditorItemKind, EditorItemKinds } from "../model";

type Dispatch = (action: AppAction) => void;

const paletteItems: ReadonlyArray<{
	readonly kind: EditorItemKind;
	readonly label: string;
	readonly icon: string;
	readonly description: string;
}> = [
	{
		kind: EditorItemKinds.Hopscotch,
		label: "Hopscotch",
		icon: "♙",
		description: "Spray-painted ground game",
	},
	{
		kind: EditorItemKinds.Plant,
		label: "Plant",
		icon: "♧",
		description: "Leafy decoration",
	},
	{
		kind: EditorItemKinds.Lamp,
		label: "Lamp",
		icon: "♢",
		description: "Warm floor lamp",
	},
	{
		kind: EditorItemKinds.Wall,
		label: "Wall",
		icon: "▰",
		description: "Solid boundary",
	},
	{
		kind: EditorItemKinds.Platform,
		label: "Platform",
		icon: "▥",
		description: "Raised surface",
	},
	{
		kind: EditorItemKinds.Crate,
		label: "Crate",
		icon: "□",
		description: "Pushable object",
	},
	{
		kind: EditorItemKinds.Chest,
		label: "Chest",
		icon: "▣",
		description: "Open from the front",
	},
	{
		kind: EditorItemKinds.Sign,
		label: "Sign",
		icon: "⚐",
		description: "Read from the front",
	},
];

const entityLabel = (world: World, entity: EntityId): string => {
	const obstacle = world.obstacles.get(entity);
	if (obstacle !== undefined) {
		if (obstacle.kind === ObstacleKinds.Wall) return "Wall";
		if (obstacle.kind === ObstacleKinds.Platform) return "Platform";
		if (obstacle.kind === ObstacleKinds.Chest) return "Chest";
		return "Crate";
	}
	const decoration = world.decorations.get(entity);
	if (decoration?.kind === DecorationKinds.Hopscotch) return "Hopscotch";
	if (decoration?.kind === DecorationKinds.Plant) return "Plant";
	if (decoration?.kind === DecorationKinds.Sign) return "Sign";
	return "Lamp";
};

export const makeDesignStudioPanel = (
	interactionRuntime: DesignStudioInteractionRuntime,
) => {
	const numberInput = (
		label: string,
		value: number,
		minimum: number,
		maximum: number | undefined,
		onChange: (value: number) => void,
	): TemplateResult => html`
			<label class="block min-w-0 flex-1 text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
				${label}
				<input
					type="number"
					.value=${String(Math.round(value))}
					min=${minimum}
					max=${maximum ?? ""}
					step="10"
					class="mt-2 block w-full rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[14px] font-semibold text-[#fff1d6] outline-none focus:border-[#e8b875]"
					@change=${(event: Event) => {
						const input = event.currentTarget;
						if (
							input instanceof HTMLInputElement &&
							Number.isFinite(input.valueAsNumber)
						)
							onChange(input.valueAsNumber);
					}}
				/>
			</label>
		`;

	const editorPanelTemplate = (
		world: World,
		panelVisible: boolean,
		dispatch: Dispatch,
	): TemplateResult => {
		const selected = world.editor.selected;
		const selectedEntity =
			selected === null || selected === "floor" ? undefined : selected;
		const selectedBody =
			selectedEntity === undefined
				? undefined
				: world.bodies.get(selectedEntity);
		const selectedPosition =
			selectedEntity === undefined
				? undefined
				: world.positions.get(selectedEntity);
		const selectedMaximumBody =
			selectedEntity === undefined
				? undefined
				: maximumEditorBody(world, selectedEntity);
		const selectedHeight =
			selectedEntity === undefined
				? undefined
				: editorEntityHeight(world, selectedEntity);
		const selectedHeightLimits =
			selectedEntity === undefined
				? undefined
				: editorEntityHeightLimits(world, selectedEntity);
		const selectedSignContent =
			selectedEntity === undefined ||
			world.decorations.get(selectedEntity)?.kind !== DecorationKinds.Sign
				? undefined
				: (world.signContents.get(selectedEntity) ?? defaultSignContent);
		return html`
				<aside data-editor-panel class=${`absolute top-0 right-0 z-30 flex h-full w-85 flex-col overscroll-contain border-l border-[#41565a] bg-[#0d181f]/98 text-[#fff1d6] shadow-[-18px_0_44px_rgba(3,9,12,0.38)] transition-transform duration-180 ease-out motion-reduce:transition-none ${panelVisible ? "translate-x-0" : "pointer-events-none translate-x-full"}`}>
					<header class="border-b border-[#30434a] px-5 pt-6 pb-4">
						<div class="text-lg font-heading font-bold tracking-[0.2em] text-[#e8b875] uppercase">Design studio</div>
						<div class="text-[11px] leading-relaxed text-[#819993]">Scroll to pan · Command/Control-drag to pan</div>
					</header>

					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
						<section>
							<div class="flex items-end justify-between">
								<h2 class="m-0 text-[12px] font-heading font-bold tracking-[0.16em] text-[#aebfba] uppercase">Add objects</h2>
								<span class="text-[10px] text-[#708780]">DRAG TO PLACE</span>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-2">
								${paletteItems.map(
									(item) => html`
										<button
											data-palette-item
											type="button"
											class="group cursor-grab touch-none rounded-xl border border-[#30464c] bg-[#17272e] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#d9a969] hover:bg-[#20343b] active:cursor-grabbing"
											@pointerdown=${(event: PointerEvent) =>
												interactionRuntime.startPaletteDrag(
													event,
													item.kind,
													world,
												)}
										>
											<span class="text-[22px] text-[#e8b875]">${item.icon}</span>
											<span class="mt-1 block text-[13px] font-bold">${item.label}</span>
											<span class="mt-0.5 block text-[10px] leading-snug text-[#819993]">${item.description}</span>
										</button>
									`,
								)}
							</div>
						</section>

						<section class="mt-6 border-t border-[#30434a] pt-5">
							<h2 class="m-0 text-[12px] font-heading font-bold tracking-[0.16em] text-[#aebfba] uppercase">Selection</h2>
							${
								selected === "floor"
									? html`
										<div class="mt-3 rounded-xl bg-[#17272e] p-4">
											<div class="text-[15px] font-bold">Floor plan</div>
											<div class="mt-1 text-[11px] leading-relaxed text-[#819993]">Drag any gold edge or handle, or enter exact dimensions.</div>
											<div class="mt-4 flex gap-3">
												${numberInput(
													"Width",
													world.floorPlan.width,
													minimumFloorWidth,
													undefined,
													(width) =>
														dispatch(
															Action.EditorFloorResized({
																floorPlan: { ...world.floorPlan, width },
															}),
														),
												)}
												${numberInput(
													"Depth",
													world.floorPlan.depth,
													minimumFloorDepth,
													undefined,
													(depth) =>
														dispatch(
															Action.EditorFloorResized({
																floorPlan: { ...world.floorPlan, depth },
															}),
														),
												)}
												</div>
										</div>
									`
									: selectedEntity !== undefined &&
											selectedBody !== undefined &&
											selectedPosition !== undefined &&
											selectedMaximumBody !== undefined
										? html`
											<div class="mt-3 rounded-xl bg-[#17272e] p-4">
												<div class="flex items-start justify-between gap-3">
													<div>
														<div class="text-[15px] font-bold">${entityLabel(world, selectedEntity)}</div>
														<div class="mt-1 text-[10px] text-[#819993]">X ${Math.round(selectedPosition.x)} · Y ${Math.round(selectedPosition.y)}</div>
													</div>
									<button type="button" class="rounded-lg border border-[#704a45] px-2.5 py-1.5 text-[10px] font-bold text-[#ef9f8e] hover:bg-[#3a2425]" @click=${() => dispatch(Action.EditorDeleteSelected())}>DELETE</button>
												</div>
												<div class="mt-4 flex gap-3">
													${numberInput(
														"Width",
														selectedBody.width,
														minimumEntityExtent,
														selectedMaximumBody.width,
														(width) =>
															dispatch(
																Action.EditorEntityResized({
																	entity: selectedEntity,
																	body: { ...selectedBody, width },
																}),
															),
													)}
											${numberInput(
												"Depth",
												selectedBody.depth,
												minimumEntityExtent,
												selectedMaximumBody.depth,
												(depth) =>
													dispatch(
														Action.EditorEntityResized({
															entity: selectedEntity,
															body: { ...selectedBody, depth },
														}),
													),
											)}
											${
												selectedHeight !== undefined &&
												selectedHeightLimits !== undefined &&
												selectedHeightLimits.maximum > 0
													? numberInput(
															"Height",
															selectedHeight,
															selectedHeightLimits.minimum,
															selectedHeightLimits.maximum,
															(height) =>
																dispatch(
																	Action.EditorEntityHeightChanged({
																		entity: selectedEntity,
																		height,
																	}),
																),
														)
													: html``
											}
										</div>
										${
											selectedSignContent === undefined
												? html``
												: html`
													<div class="mt-5 border-t border-[#30434a] pt-4">
														<label class="block text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
															Title
															<input
																type="text"
																.value=${selectedSignContent.title}
																class="mt-2 block w-full rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[14px] font-semibold text-[#fff1d6] outline-none focus:border-[#e8b875]"
																@change=${(event: Event) => {
																	const input = event.currentTarget;
																	if (!(input instanceof HTMLInputElement))
																		return;
																	dispatch(
																		Action.EditorSignContentChanged({
																			entity: selectedEntity,
																			content: {
																				...selectedSignContent,
																				title: input.value,
																			},
																		}),
																	);
																}}
															/>
														</label>
														<label class="mt-4 block text-[11px] font-bold tracking-[0.14em] text-[#819993] uppercase">
															Body
															<textarea
																.value=${selectedSignContent.body}
																rows="5"
																class="mt-2 block w-full resize-y rounded-lg border border-[#3a5157] bg-[#16252c] px-3 py-2 text-[13px] leading-relaxed text-[#fff1d6] outline-none focus:border-[#e8b875]"
																@change=${(event: Event) => {
																	const input = event.currentTarget;
																	if (!(input instanceof HTMLTextAreaElement))
																		return;
																	dispatch(
																		Action.EditorSignContentChanged({
																			entity: selectedEntity,
																			content: {
																				...selectedSignContent,
																				body: input.value,
																			},
																		}),
																	);
																}}
															></textarea>
														</label>
													</div>
												`
										}
									</div>
										`
										: html`<div class="mt-3 rounded-xl border border-dashed border-[#30464c] px-4 py-5 text-center text-[11px] leading-relaxed text-[#819993]">Select an object to move or resize it.<br />Select the floor to change the plan.</div>`
							}
						</section>
					</div>

					<footer class="border-t border-[#30434a] px-5 py-4 text-[10px] leading-relaxed text-[#718780]">
						Drag objects to move · Scroll to pan<br />⌘/Ctrl-drag pans · Delete removes a selection
					</footer>
				</aside>
			`;
	};
	return { editorPanelTemplate };
};
