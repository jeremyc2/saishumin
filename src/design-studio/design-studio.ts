import { dual } from "effect/Function";
import type { Action } from "../app/action";
import type { Pipeable } from "../pipeable";
import type { World } from "../world/world";
import { updateDesignStudioAction } from "./internal/actions";

type DesignStudioAction = Exclude<
	Action,
	{ readonly _tag: "KeyChanged" | "Tick" | "SignDismissed" }
>;

export const updateDesignStudio: Pipeable<
	World,
	[action: DesignStudioAction],
	World
> = dual(
	2,
	(world: World, action: DesignStudioAction): World =>
		updateDesignStudioAction(world, action),
);
