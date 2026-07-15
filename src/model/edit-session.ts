import {
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	isInsideFloorPlan,
	isNewEditorItemPlacementValid,
} from "../ecs/editor-placement";
import {
	placementElevationForEntity,
	placementElevationForKind,
} from "../ecs/elevation";
import { isSupportSurfaceTransformValid } from "../ecs/support-surface";
import {
	crateHeight,
	stationaryVelocity,
	type World,
	wallHeight,
} from "../ecs/world";
import {
	Decoration,
	DecorationKinds,
	defaultSignContent,
	Elevation,
	Obstacle,
	ObstacleKinds,
	type Position,
} from "./component";
import {
	defaultEditorItemBody,
	defaultEditorItemHeight,
	type EditorItemKind,
	EditorItemKinds,
	type EditSessionOperation,
	type EditSessionPreview,
	type EditSessionRejectionReason,
	type EditSessionValidity,
} from "./editor";
import { EntityId, type EntityId as EntityIdType } from "./entity-id";
import { floorTilesCoveringPlan } from "./floor-tile";

export type EditSessionPresentation = {
	readonly active: boolean;
	readonly invalidPreview: boolean;
	readonly invalidReleased: boolean;
	readonly rejectionReason: EditSessionRejectionReason | null;
};

export const editSessionPresentation = (
	world: World,
): EditSessionPresentation => {
	const session = world.editor.editSession;
	return {
		active: session !== null,
		invalidPreview: session?.validity.kind === "invalid",
		invalidReleased: session?.phase === "invalid-released",
		rejectionReason:
			session?.validity.kind === "invalid" ? session.validity.reason : null,
	};
};

const nextEntityId = (world: World): EntityIdType => {
	let greatestId = 0;
	for (const entity of world.positions.keys())
		greatestId = Math.max(greatestId, entity);
	return EntityId(greatestId + 1);
};

export const addEditorItemToWorld = (
	world: World,
	itemKind: EditorItemKind,
	position: Position,
): World => {
	const entity = nextEntityId(world);
	const body = defaultEditorItemBody(itemKind);
	const height = defaultEditorItemHeight(itemKind);
	const positions = new Map(world.positions).set(entity, position);
	const bodies = new Map(world.bodies).set(entity, body);
	const obstacles = new Map(world.obstacles);
	const decorations = new Map(world.decorations);
	const elevations = new Map(world.elevations).set(
		entity,
		Elevation.make({
			z: placementElevationForKind(world, itemKind, position, body),
			velocity: stationaryVelocity,
		}),
	);
	const signContents = new Map(world.signContents);

	if (itemKind === EditorItemKinds.Wall)
		obstacles.set(
			entity,
			Obstacle.make({ height: wallHeight, kind: ObstacleKinds.Wall }),
		);
	else if (itemKind === EditorItemKinds.Platform)
		obstacles.set(
			entity,
			Obstacle.make({ height: 40, kind: ObstacleKinds.Platform }),
		);
	else if (itemKind === EditorItemKinds.Crate)
		obstacles.set(
			entity,
			Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
		);
	else if (itemKind === EditorItemKinds.Chest)
		obstacles.set(entity, Obstacle.make({ height, kind: ObstacleKinds.Chest }));
	else {
		const kind =
			itemKind === EditorItemKinds.Rug
				? DecorationKinds.Rug
				: itemKind === EditorItemKinds.Plant
					? DecorationKinds.Plant
					: itemKind === EditorItemKinds.Sign
						? DecorationKinds.Sign
						: DecorationKinds.Lamp;
		decorations.set(entity, Decoration.make({ kind, height }));
		if (itemKind === EditorItemKinds.Sign)
			signContents.set(entity, defaultSignContent);
	}

	return {
		...world,
		positions,
		bodies,
		obstacles,
		decorations,
		elevations,
		signContents,
		editor: { ...world.editor, selected: entity },
	};
};

const applyOperation = (
	world: World,
	operation: EditSessionOperation,
): World => {
	if (operation.kind === "create")
		return addEditorItemToWorld(world, operation.itemKind, operation.position);
	if (operation.kind === "resize-floor") {
		return {
			...world,
			floorPlan: operation.floorPlan,
			floorOrigin: operation.floorOrigin,
			floorTiles: floorTilesCoveringPlan(
				world.floorTiles,
				world.floorTileOrigin,
				operation.floorPlan,
				operation.floorOrigin,
			),
		};
	}
	const positions = new Map(world.positions).set(
		operation.entity,
		operation.position,
	);
	const bodies =
		operation.kind === "resize"
			? new Map(world.bodies).set(operation.entity, operation.body)
			: world.bodies;
	const elevations = new Map(world.elevations).set(operation.entity, {
		z: placementElevationForEntity(
			world,
			operation.entity,
			operation.position,
			operation.kind === "resize" ? operation.body : operation.originalBody,
		),
		velocity: stationaryVelocity,
	});
	return { ...world, positions, bodies, elevations };
};

const validityFor = (
	world: World,
	operation: EditSessionOperation,
): EditSessionValidity => {
	if (operation.kind === "create") {
		const body = defaultEditorItemBody(operation.itemKind);
		if (!isInsideFloorPlan(world, operation.position, body))
			return { kind: "invalid", reason: "outside-floor" };
		return isNewEditorItemPlacementValid(
			world,
			operation.itemKind,
			operation.position,
			body,
		)
			? { kind: "valid" }
			: { kind: "invalid", reason: "overlaps-editor-item" };
	}
	if (operation.kind === "resize-floor") {
		const candidate = applyOperation(world, operation);
		return isFloorPlanPlacementValid(candidate, operation.floorPlan)
			? { kind: "valid" }
			: { kind: "invalid", reason: "floor-excludes-editor-item" };
	}
	const body =
		operation.kind === "resize" ? operation.body : operation.originalBody;
	if (!isInsideFloorPlan(world, operation.position, body))
		return { kind: "invalid", reason: "outside-floor" };
	if (
		!isSupportSurfaceTransformValid(
			world,
			operation.entity,
			operation.position,
			body,
			operation.originalPosition,
			operation.originalBody,
		)
	)
		return { kind: "invalid", reason: "occupied-support" };
	return isEntityPlacementValid(
		world,
		operation.entity,
		operation.position,
		body,
		{
			position: operation.originalPosition,
			body: operation.originalBody,
		},
	)
		? { kind: "valid" }
		: { kind: "invalid", reason: "overlaps-editor-item" };
};

export const beginEditSession = (
	world: World,
	operation: EditSessionOperation,
): World => {
	if (!world.editor.open || world.editor.editSession !== null) return world;
	return {
		...world,
		editor: {
			...world.editor,
			editSession: {
				operation,
				validity: validityFor(world, operation),
				phase: "active",
			},
		},
	};
};

export const previewEditSession = (
	world: World,
	preview: EditSessionPreview,
): World => {
	const session = world.editor.editSession;
	if (session === null || session.operation.kind !== preview.kind) return world;
	const operation = {
		...session.operation,
		...preview,
	} as EditSessionOperation;
	return {
		...world,
		editor: {
			...world.editor,
			camera: world.editor.camera,
			editSession: {
				operation,
				validity: validityFor(world, operation),
				phase: "active",
			},
		},
	};
};

export const editSessionView = (world: World): World => {
	const session = world.editor.editSession;
	return session === null ? world : applyOperation(world, session.operation);
};

export const commitEditSession = (world: World): World => {
	const session = world.editor.editSession;
	if (session === null) return world;
	if (session.validity.kind === "invalid")
		return {
			...world,
			editor: {
				...world.editor,
				editSession: { ...session, phase: "invalid-released" },
			},
		};
	const committed = applyOperation(world, session.operation);
	return { ...committed, editor: { ...committed.editor, editSession: null } };
};

export const cancelEditSession = (world: World): World => {
	const session = world.editor.editSession;
	if (session === null) return world;
	return {
		...world,
		editor: { ...world.editor, editSession: null },
	};
};
