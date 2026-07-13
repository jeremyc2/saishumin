import { Data } from "effect";
import type { Body, Position } from "./component";
import type { Control } from "./control";
import type { EditorItemKind, EditorSelection } from "./editor";
import type { EntityId } from "./entity-id";

export type Action = Data.TaggedEnum<{
	KeyChanged: { readonly key: Control; readonly pressed: boolean };
	Tick: { readonly time: number };
	EditorToggled: Record<never, never>;
	EditorSelectionChanged: { readonly selection: EditorSelection };
	EditorItemAdded: {
		readonly kind: EditorItemKind;
		readonly position: Position;
	};
	EditorEntityMoved: {
		readonly entity: EntityId;
		readonly position: Position;
		readonly originalPosition?: Position;
		readonly originalBody?: Body;
		readonly preview?: boolean;
	};
	EditorEntityResized: {
		readonly entity: EntityId;
		readonly body: Body;
		readonly position?: Position;
		readonly originalPosition?: Position;
		readonly originalBody?: Body;
		readonly preview?: boolean;
	};
	EditorEntityInteractionFinished: {
		readonly entity: EntityId;
		readonly originalPosition: Position;
		readonly originalBody: Body;
	};
	EditorEntityHeightChanged: {
		readonly entity: EntityId;
		readonly height: number;
	};
	EditorFloorResized: {
		readonly floorPlan: Body;
		readonly originDelta?: Position;
		readonly preview?: boolean;
	};
	EditorFloorInteractionFinished: {
		readonly originalFloorPlan: Body;
		readonly originOffset: Position;
	};
	EditorCameraChanged: { readonly camera: Position };
	EditorInvalidPlacementDismissed: Record<never, never>;
	EditorDeleteSelected: Record<never, never>;
}>;

export const Action = Data.taggedEnum<Action>();
