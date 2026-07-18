import { html, svg, type TemplateResult } from "lit-html";
import { Action, type Action as AppAction } from "../../app/action";
import {
	boxTemplate,
	chestTemplate,
	crateTemplate,
	decorationTemplate,
} from "../../presentation/artwork/entities";
import {
	canvasViewportForScreen,
	points,
	project,
	projectedRectangle,
	viewport,
} from "../../presentation/geometry/projection";
import { type LitTemplate, nothing } from "../../presentation/lit-template";
import {
	Decoration,
	type DecorationKind,
	DecorationKinds,
	defaultSignContent,
} from "../../world/components";
import type {
	EditSessionRejectionReason,
	InvalidPlacement,
} from "../../world/editor-state";
import { surfaceAt } from "../../world/spatial/collision";
import { placementElevationForKind } from "../../world/spatial/elevation";
import { isSupportSurfaceOccupied } from "../../world/spatial/support-surface";
import type { World } from "../../world/world";
import { groundElevation } from "../../world/world";
import { EditSessionStatus } from "../edit-session/edit-session";
import type { DesignStudioInteraction } from "../interaction/interaction";
import {
	CharacterSpawnKinds,
	type DesignStudioItemKind,
	defaultEditorItemBody,
	defaultEditorItemHeight,
	EditorItemKinds,
	spatialEditorItemKind,
} from "../model";

type Dispatch = (action: AppAction) => void;

export const invalidPreviewDescription = (input: {
	readonly rejectionReason: EditSessionRejectionReason | null;
	readonly invalidPlacementKind: InvalidPlacement["kind"] | null;
	readonly occupiedSupport: boolean;
}): string => {
	if (
		input.rejectionReason === "floor-excludes-editor-item" ||
		input.invalidPlacementKind === "floor"
	)
		return "The floor plan must contain every existing object.";
	if (input.rejectionReason === "occupied-support")
		return "Move every object off this platform before moving or shrinking it.";
	if (input.occupiedSupport)
		return "Move every object off this platform before moving, shrinking, or deleting it.";
	return "Keep the object inside the floor plan and clear of other objects.";
};

const decorationKindForEditorItem = (
	itemKind: DesignStudioItemKind,
): DecorationKind => {
	switch (itemKind) {
		case EditorItemKinds.Hopscotch:
			return DecorationKinds.Hopscotch;
		case EditorItemKinds.Plant:
			return DecorationKinds.Plant;
		case EditorItemKinds.Sign:
			return DecorationKinds.Sign;
		default:
			return DecorationKinds.Lamp;
	}
};

export const makeDesignStudioOverlays = (
	interaction: DesignStudioInteraction,
) => {
	let signDismissPointer: number | null = null;
	const invalidPlacementTemplate = (
		world: World,
		editSessionStatus: EditSessionStatus,
		dispatch: Dispatch,
	): TemplateResult => {
		const invalidPlacement = world.editor.invalidPlacement;
		const occupiedSupport =
			invalidPlacement?.kind === "entity" &&
			isSupportSurfaceOccupied(
				world,
				invalidPlacement.entity,
				invalidPlacement.position,
				invalidPlacement.body,
			);
		const rejectionReason = EditSessionStatus.$match(editSessionStatus, {
			Inactive: () => null,
			Active: () => null,
			InvalidPreview: ({ reason }) => reason,
			InvalidReleased: ({ reason }) => reason,
		});
		const sessionActive = !EditSessionStatus.$is("Inactive")(editSessionStatus);
		const description = invalidPreviewDescription({
			rejectionReason,
			invalidPlacementKind: invalidPlacement?.kind ?? null,
			occupiedSupport,
		});
		return html`
				<div class="editor-invalid-cursor absolute inset-0 z-50 flex items-center justify-center bg-[#071015]/48 px-6" role="presentation">
					<div class="w-full max-w-95 rounded-2xl border border-[#7d4b4b] bg-[#15242b] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" role="alertdialog" aria-modal="true" aria-labelledby="invalid-position-title" aria-describedby="invalid-position-description">
						<div id="invalid-position-title" class="text-[17px] font-heading font-bold tracking-[0.04em] text-[#e59a91]">Invalid position</div>
						<p id="invalid-position-description" class="mt-2 mb-0 text-base leading-relaxed text-[#b9cbc4]">${description}</p>
						<div class="mt-5 flex justify-end">
							<button type="button" autofocus class="rounded-lg border border-[#9a625d] bg-[#6f3f3e] px-5 py-2 text-[11px] font-bold tracking-[0.12em] text-[#fff1ed] transition hover:bg-[#80504d]" @click=${() => dispatch(sessionActive ? Action.EditorEditSessionCancelled() : Action.EditorInvalidPlacementDismissed())}>OK</button>
						</div>
					</div>
				</div>
			`;
	};

	const signDialogTemplate = (
		world: World,
		dispatch: Dispatch,
	): TemplateResult => {
		const content =
			world.readingSign === null
				? defaultSignContent
				: (world.signContents.get(world.readingSign) ?? defaultSignContent);
		return html`
			<div class="absolute inset-0 z-50 flex items-center justify-center bg-[#071015]/48 px-6" role="presentation">
				<div class="flex max-h-[calc(100vh-3rem)] w-full max-w-95 flex-col border border-[#8b633c] bg-[#ecd19e] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" role="alertdialog" aria-modal="true" aria-labelledby="sign-title" aria-describedby="sign-description">
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain pr-2">
						<div id="sign-title" class="wrap-break-word text-[17px] font-heading font-bold tracking-[0.04em] text-[#4b2f1e]">${content.title}</div>
						<p id="sign-description" class="mt-2 mb-0 wrap-break-word whitespace-pre-wrap text-base leading-relaxed text-[#5d3b24]">${content.body}</p>
					</div>
					<div class="mt-5 flex justify-end">
						<button type="button" autofocus class="rounded-lg border border-[#5d3b24] bg-[#70462b] px-5 py-2 text-[11px] font-bold tracking-[0.12em] text-[#fff3dc] transition hover:bg-[#845535]" @pointerdown=${(
							event: PointerEvent,
						) => {
							signDismissPointer = event.pointerId;
						}} @pointerup=${(event: PointerEvent) => {
							if (signDismissPointer !== event.pointerId) return;
							signDismissPointer = null;
							dispatch(Action.SignDismissed());
						}} @pointercancel=${(event: PointerEvent) => {
							if (signDismissPointer === event.pointerId)
								signDismissPointer = null;
						}} @click=${(event: MouseEvent) => {
							if (event.detail !== 0) {
								event.preventDefault();
								event.stopPropagation();
								return;
							}
							dispatch(Action.SignDismissed());
						}}>DISMISS</button>
					</div>
				</div>
			</div>
		`;
	};

	const createPreviewTemplate = (
		world: World,
		invalidPreview: boolean,
	): LitTemplate => {
		const preview = interaction.createPreview();
		if (preview === null) return nothing;
		const body = defaultEditorItemBody(preview.itemKind);
		const position = preview.position;
		const characterSpawn =
			preview.itemKind === CharacterSpawnKinds.Player ||
			preview.itemKind === CharacterSpawnKinds.LavaMonster;
		const spatialKind = spatialEditorItemKind(preview.itemKind);
		let baseElevation = groundElevation;
		if (characterSpawn) baseElevation = surfaceAt(world, position, body);
		else if (spatialKind !== undefined)
			baseElevation = placementElevationForKind(
				world,
				spatialKind,
				position,
				body,
			);
		const height = defaultEditorItemHeight(preview.itemKind);
		let visual: TemplateResult;
		if (characterSpawn) {
			const center = project(position, baseElevation);
			const player = preview.itemKind === CharacterSpawnKinds.Player;
			const radius = player ? 27 : 34;
			const color = player ? "#55b9f3" : "#f06a3b";
			visual = svg`
				<ellipse cx=${center.x} cy=${center.y} rx=${radius} ry=${radius * 0.5} fill=${color} opacity="0.34" />
				<ellipse cx=${center.x} cy=${center.y} rx=${radius - 5} ry=${(radius - 5) * 0.5} fill="none" stroke=${color} stroke-width="5" vector-effect="non-scaling-stroke" />
				<circle cx=${center.x} cy=${center.y} r="5" fill=${color} />
			`;
		} else if (preview.itemKind === EditorItemKinds.Crate)
			visual = crateTemplate({
				position,
				body,
				height,
				grabbed: false,
				baseElevation,
			});
		else if (preview.itemKind === EditorItemKinds.Chest)
			visual = chestTemplate({
				position,
				body,
				height,
				opened: false,
				baseElevation,
			});
		else if (preview.itemKind === EditorItemKinds.Wall)
			visual = boxTemplate({
				position,
				body,
				height,
				colors: { top: "#426772", front: "#29454f" },
				baseElevation,
			});
		else if (preview.itemKind === EditorItemKinds.Platform)
			visual = boxTemplate({
				position,
				body,
				height,
				colors: { top: "#77927e", front: "#4f6c61" },
				baseElevation,
			});
		else
			visual = decorationTemplate({
				position,
				body,
				decoration: Decoration.make({
					kind: decorationKindForEditorItem(preview.itemKind),
					height,
				}),
				baseElevation,
			});
		const accent = invalidPreview ? "#e59a91" : "#fff0a8";
		const canvasViewport = canvasViewportForScreen({
			screen:
				typeof window === "undefined"
					? viewport
					: { width: window.innerWidth, height: window.innerHeight },
			zoom: interaction.zoom(),
		});
		return html`
				<svg data-editor-create-preview data-can-drop=${String(preview.canDrop)} aria-hidden="true" class="pointer-events-none absolute inset-0 z-40 h-full w-full" viewBox=${`${canvasViewport.left} ${canvasViewport.top} ${canvasViewport.width} ${canvasViewport.height}`} preserveAspectRatio="xMidYMid meet">
					<g transform=${`translate(${world.editor.camera.x} ${world.editor.camera.y})`}>
						<g opacity="0.82">${visual}</g>
						<polygon data-editor-create-outline points=${points(projectedRectangle(position, body, baseElevation))} fill="none" stroke=${accent} stroke-width="4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" />
					</g>
				</svg>
				`;
	};

	const paletteGuidanceTemplate = (
		popover: {
			readonly left: number;
			readonly top: number;
			readonly fading: boolean;
		} | null,
	): LitTemplate =>
		popover === null
			? nothing
			: html`<div role="status" class=${`pointer-events-none fixed z-50 w-60 rounded-xl border border-[#d9a969] bg-[#17272e] px-4 py-3 text-[13px] font-semibold text-[#fff1d6] shadow-xl transition-opacity duration-200 ${popover.fading ? "opacity-0" : "opacity-100"}`} style=${`left: ${Math.max(12, popover.left - 252)}px; top: ${popover.top}px;`}>Drag this item onto the room to place it.</div>`;
	return {
		invalidPlacementTemplate,
		signDialogTemplate,
		createPreviewTemplate,
		paletteGuidanceTemplate,
	};
};
