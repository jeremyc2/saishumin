import { Schema } from "effect";
import {
	Body,
	defaultDecorationHeight,
	isDecorationKind,
} from "../world/components";

export const EditorItemKind = Schema.Literals([
	"hopscotch",
	"plant",
	"lamp",
	"wall",
	"platform",
	"crate",
	"chest",
	"sign",
]);
export type EditorItemKind = typeof EditorItemKind.Type;

export const EditorItemKinds = {
	Hopscotch: EditorItemKind.make("hopscotch"),
	Plant: EditorItemKind.make("plant"),
	Lamp: EditorItemKind.make("lamp"),
	Wall: EditorItemKind.make("wall"),
	Platform: EditorItemKind.make("platform"),
	Crate: EditorItemKind.make("crate"),
	Chest: EditorItemKind.make("chest"),
	Sign: EditorItemKind.make("sign"),
} as const;

export const isEditorItemKind = Schema.is(EditorItemKind);

export const defaultEditorItemBody = (kind: EditorItemKind): Body => {
	if (kind === EditorItemKinds.Hopscotch)
		return Body.make({ width: 150, depth: 280 });
	if (kind === EditorItemKinds.Plant)
		return Body.make({ width: 72, depth: 72 });
	if (kind === EditorItemKinds.Lamp) return Body.make({ width: 64, depth: 64 });
	if (kind === EditorItemKinds.Wall)
		return Body.make({ width: 220, depth: 36 });
	if (kind === EditorItemKinds.Platform)
		return Body.make({ width: 200, depth: 120 });
	if (kind === EditorItemKinds.Chest)
		return Body.make({ width: 84, depth: 64 });
	if (kind === EditorItemKinds.Sign) return Body.make({ width: 88, depth: 56 });
	return Body.make({ width: 70, depth: 70 });
};

export const defaultEditorItemHeight = (kind: EditorItemKind): number => {
	if (isDecorationKind(kind)) return defaultDecorationHeight(kind);
	if (kind === EditorItemKinds.Wall) return 80;
	if (kind === EditorItemKinds.Platform) return 40;
	if (kind === EditorItemKinds.Chest) return 52;
	return 62;
};

export const editorItemHeightLimits = (
	kind: EditorItemKind,
): { readonly minimum: number; readonly maximum: number } => {
	if (kind === EditorItemKinds.Hopscotch) return { minimum: 0, maximum: 0 };
	if (kind === EditorItemKinds.Platform) return { minimum: 16, maximum: 160 };
	if (kind === EditorItemKinds.Crate || kind === EditorItemKinds.Chest)
		return { minimum: 32, maximum: 160 };
	if (kind === EditorItemKinds.Sign) return { minimum: 64, maximum: 240 };
	return { minimum: 40, maximum: 240 };
};

export const maximumEditorItemBody = (kind: EditorItemKind): Body => {
	if (kind === EditorItemKinds.Hopscotch)
		return Body.make({ width: 800, depth: 1200 });
	if (kind === EditorItemKinds.Plant || kind === EditorItemKinds.Lamp)
		return Body.make({ width: 180, depth: 180 });
	if (kind === EditorItemKinds.Wall)
		return Body.make({ width: 1600, depth: 1600 });
	if (kind === EditorItemKinds.Platform)
		return Body.make({ width: 800, depth: 800 });
	if (kind === EditorItemKinds.Chest)
		return Body.make({ width: 240, depth: 240 });
	if (kind === EditorItemKinds.Sign)
		return Body.make({ width: 220, depth: 160 });
	return Body.make({ width: 240, depth: 240 });
};
