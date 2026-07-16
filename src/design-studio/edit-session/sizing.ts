import { Body, CharacterKinds } from "../../world/components";
import type { EntityId } from "../../world/entity-id";
import type { World } from "../../world/world";
import {
	CharacterSpawnKinds,
	type DesignStudioItemKind,
	defaultEditorItemHeight,
	editorItemHeightLimits,
	isEditorItemKind,
	maximumEditorItemBody,
} from "../model";

type EditorEntityInput = { readonly world: World; readonly entity: EntityId };

export const editorItemKindForEntity = ({
	world,
	entity,
}: EditorEntityInput): DesignStudioItemKind | undefined => {
	const character = world.characters.get(entity);
	if (character?.kind === CharacterKinds.Player)
		return CharacterSpawnKinds.Player;
	if (character?.kind === CharacterKinds.LavaMonster)
		return CharacterSpawnKinds.LavaMonster;
	const kind =
		world.obstacles.get(entity)?.kind ?? world.decorations.get(entity)?.kind;
	return kind !== undefined && isEditorItemKind(kind) ? kind : undefined;
};

export const maximumEditorBody = ({
	world,
	entity,
}: EditorEntityInput): Body => {
	const kind = editorItemKindForEntity({ world, entity });
	return kind === undefined
		? Body.make({
				width: Number.POSITIVE_INFINITY,
				depth: Number.POSITIVE_INFINITY,
			})
		: maximumEditorItemBody(kind);
};

export const editorEntityHeight = ({
	world,
	entity,
}: EditorEntityInput): number => {
	const obstacle = world.obstacles.get(entity);
	if (obstacle !== undefined) return obstacle.height;
	const decoration = world.decorations.get(entity);
	return decoration?.height ?? 0;
};

export const editorEntityHeightLimits = ({
	world,
	entity,
}: EditorEntityInput): {
	readonly minimum: number;
	readonly maximum: number;
} => {
	const kind = editorItemKindForEntity({ world, entity });
	return kind === undefined
		? { minimum: 0, maximum: 0 }
		: editorItemHeightLimits(kind);
};

export const defaultEntityHeight = (kind: DesignStudioItemKind): number =>
	defaultEditorItemHeight(kind);
