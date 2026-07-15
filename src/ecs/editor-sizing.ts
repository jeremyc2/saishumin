import { Body } from "../model/component";
import {
	defaultEditorItemHeight,
	type EditorItemKind,
	editorItemHeightLimits,
	isEditorItemKind,
	maximumEditorItemBody,
} from "../model/editor";
import type { EntityId } from "../model/entity-id";
import type { World } from "./world";

export const editorItemKindForEntity = (
	world: World,
	entity: EntityId,
): EditorItemKind | undefined => {
	const kind =
		world.obstacles.get(entity)?.kind ?? world.decorations.get(entity)?.kind;
	return kind !== undefined && isEditorItemKind(kind) ? kind : undefined;
};

export const maximumEditorBody = (world: World, entity: EntityId): Body => {
	const kind = editorItemKindForEntity(world, entity);
	return kind === undefined
		? Body.make({
				width: Number.POSITIVE_INFINITY,
				depth: Number.POSITIVE_INFINITY,
			})
		: maximumEditorItemBody(kind);
};

export const editorEntityHeight = (world: World, entity: EntityId): number => {
	const obstacle = world.obstacles.get(entity);
	if (obstacle !== undefined) return obstacle.height;
	const decoration = world.decorations.get(entity);
	return decoration?.height ?? 0;
};

export const editorEntityHeightLimits = (
	world: World,
	entity: EntityId,
): { readonly minimum: number; readonly maximum: number } => {
	const kind = editorItemKindForEntity(world, entity);
	return kind === undefined
		? { minimum: 0, maximum: 0 }
		: editorItemHeightLimits(kind);
};

export const defaultEntityHeight = (kind: EditorItemKind): number =>
	defaultEditorItemHeight(kind);
