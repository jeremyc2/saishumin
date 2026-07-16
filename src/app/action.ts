import { Data } from "effect";
import type { DesignStudioItemKind } from "../design-studio/model";
import type { Body, Position, SignContent } from "../world/components";
import type {
	EditorSelection,
	EditSessionOperation,
	EditSessionPreview,
} from "../world/editor-state";
import type { EntityId } from "../world/entity-id";
import type { World } from "../world/world";
import type { Control } from "./control";

export type Action = Data.TaggedEnum<{
	KeyChanged: { readonly key: Control; readonly pressed: boolean };
	Tick: { readonly time: number };
	EditorToggled: Record<never, never>;
	EditorSelectionChanged: { readonly selection: EditorSelection };
	EditorEditSessionBegan: { readonly operation: EditSessionOperation };
	EditorEditSessionPreviewed: { readonly preview: EditSessionPreview };
	EditorEditSessionAutoPanned: {
		readonly camera: Position;
		readonly preview: EditSessionPreview;
	};
	EditorEditSessionCommitted: Record<never, never>;
	EditorEditSessionCancelled: Record<never, never>;
	EditorItemAdded: {
		readonly kind: DesignStudioItemKind;
		readonly position: Position;
	};
	EditorEntityMoved: {
		readonly entity: EntityId;
		readonly position: Position;
	};
	EditorEntityResized: {
		readonly entity: EntityId;
		readonly body: Body;
		readonly position?: Position;
	};
	EditorEntityHeightChanged: {
		readonly entity: EntityId;
		readonly height: number;
	};
	EditorSignContentChanged: {
		readonly entity: EntityId;
		readonly content: SignContent;
	};
	EditorFloorResized: {
		readonly floorPlan: Body;
	};
	EditorCameraChanged: { readonly camera: Position };
	EditorInvalidPlacementDismissed: Record<never, never>;
	EditorAuthoredRoomLoaded: { readonly world: World };
	SignDismissed: Record<never, never>;
	EditorDeleteSelected: Record<never, never>;
}>;

export const Action = Data.taggedEnum<Action>();
