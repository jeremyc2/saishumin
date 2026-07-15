import type { Data } from "effect";
import { dual } from "effect/Function";
import type { Action } from "../app/action";
import type { World } from "../world/world";
import { updateDesignStudioAction } from "./internal/actions";

type DesignStudioAction = Exclude<
	Action,
	Data.TaggedEnum.Value<Action, "KeyChanged" | "Tick" | "SignDismissed">
>;

export const updateDesignStudio = dual<
	(action: DesignStudioAction) => (self: World) => World,
	(self: World, action: DesignStudioAction) => World
>(
	2,
	(world: World, action: DesignStudioAction): World =>
		updateDesignStudioAction(world, action),
);
