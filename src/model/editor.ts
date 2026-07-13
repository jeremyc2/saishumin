import { Schema } from "effect";
import { Body, type Position } from "./component";
import type { EntityId } from "./entity-id";

export const EditorItemKind = Schema.Literals([
	"rug",
	"plant",
	"lamp",
	"wall",
	"platform",
	"crate",
]);
export type EditorItemKind = typeof EditorItemKind.Type;

export const EditorItemKinds = {
	Rug: EditorItemKind.make("rug"),
	Plant: EditorItemKind.make("plant"),
	Lamp: EditorItemKind.make("lamp"),
	Wall: EditorItemKind.make("wall"),
	Platform: EditorItemKind.make("platform"),
	Crate: EditorItemKind.make("crate"),
} as const;

export const isEditorItemKind = Schema.is(EditorItemKind);

export const defaultEditorItemBody = (kind: EditorItemKind): Body => {
	if (kind === EditorItemKinds.Rug)
		return Body.make({ width: 260, depth: 150 });
	if (kind === EditorItemKinds.Plant)
		return Body.make({ width: 72, depth: 72 });
	if (kind === EditorItemKinds.Lamp) return Body.make({ width: 64, depth: 64 });
	if (kind === EditorItemKinds.Wall)
		return Body.make({ width: 220, depth: 36 });
	if (kind === EditorItemKinds.Platform)
		return Body.make({ width: 200, depth: 120 });
	return Body.make({ width: 70, depth: 70 });
};

export const defaultEditorItemHeight = (kind: EditorItemKind): number => {
	if (kind === EditorItemKinds.Rug) return 0;
	if (kind === EditorItemKinds.Plant) return 84;
	if (kind === EditorItemKinds.Lamp) return 96;
	if (kind === EditorItemKinds.Wall) return 80;
	if (kind === EditorItemKinds.Platform) return 40;
	return 62;
};

export const editorItemHeightLimits = (
	kind: EditorItemKind,
): { readonly minimum: number; readonly maximum: number } => {
	if (kind === EditorItemKinds.Rug) return { minimum: 0, maximum: 0 };
	if (kind === EditorItemKinds.Platform) return { minimum: 16, maximum: 160 };
	if (kind === EditorItemKinds.Crate) return { minimum: 32, maximum: 160 };
	return { minimum: 40, maximum: 240 };
};

export const maximumEditorItemBody = (kind: EditorItemKind): Body => {
	if (kind === EditorItemKinds.Rug)
		return Body.make({ width: 1200, depth: 800 });
	if (kind === EditorItemKinds.Plant || kind === EditorItemKinds.Lamp)
		return Body.make({ width: 180, depth: 180 });
	if (kind === EditorItemKinds.Wall)
		return Body.make({ width: 1600, depth: 1600 });
	if (kind === EditorItemKinds.Platform)
		return Body.make({ width: 800, depth: 800 });
	return Body.make({ width: 240, depth: 240 });
};

export type EditorSelection = EntityId | "floor" | null;

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
			readonly originOffset: Position;
	  }
	| { readonly kind: "new" };

export type EditorState = {
	readonly open: boolean;
	readonly camera: Position;
	readonly selected: EditorSelection;
	readonly invalidPlacement: InvalidPlacement | null;
};
