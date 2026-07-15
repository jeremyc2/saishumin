import type { Body, Position } from "./components";
import type { EntityId } from "./entity-id";

/**
 * The transient editor portion of a World. Design Studio owns transitions for
 * this state; World owns the runtime contract that stores it.
 */
export type EditorItemKind =
	| "hopscotch"
	| "plant"
	| "lamp"
	| "wall"
	| "platform"
	| "crate"
	| "chest"
	| "sign";

export type EditorSelection = EntityId | "floor" | null;

export type EditSessionRejectionReason =
	| "outside-floor"
	| "overlaps-editor-item"
	| "occupied-support"
	| "floor-excludes-editor-item";

export type EditSessionValidity =
	| { readonly kind: "valid" }
	| {
			readonly kind: "invalid";
			readonly reason: EditSessionRejectionReason;
	  };

export type EditSessionOperation =
	| {
			readonly kind: "create";
			readonly itemKind: EditorItemKind;
			readonly position: Position;
	  }
	| {
			readonly kind: "move";
			readonly entity: EntityId;
			readonly originalPosition: Position;
			readonly originalBody: Body;
			readonly position: Position;
	  }
	| {
			readonly kind: "resize";
			readonly entity: EntityId;
			readonly originalPosition: Position;
			readonly originalBody: Body;
			readonly position: Position;
			readonly body: Body;
	  }
	| {
			readonly kind: "resize-floor";
			readonly floorPlan: Body;
			readonly floorOrigin: Position;
	  };

export type EditSessionPreview =
	| { readonly kind: "create"; readonly position: Position }
	| { readonly kind: "move"; readonly position: Position }
	| {
			readonly kind: "resize";
			readonly position: Position;
			readonly body: Body;
	  }
	| {
			readonly kind: "resize-floor";
			readonly floorPlan: Body;
			readonly floorOrigin: Position;
	  };

export type EditSession = {
	readonly operation: EditSessionOperation;
	readonly validity: EditSessionValidity;
	readonly phase: "active" | "invalid-released";
};

export type InvalidPlacement =
	| {
			readonly kind: "entity";
			readonly entity: EntityId;
			readonly position: Position;
			readonly body: Body;
	  }
	| {
			readonly kind: "floor";
			readonly floorPlan: Body;
			readonly floorOrigin: Position;
	  }
	| { readonly kind: "new" };

export type EditorState = {
	readonly open: boolean;
	readonly camera: Position;
	readonly selected: EditorSelection;
	readonly invalidPlacement: InvalidPlacement | null;
	readonly editSession: EditSession | null;
};
