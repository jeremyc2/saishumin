import type { Action } from "../model/action";
import type { World } from "../world/world";
import { updateDesignStudioAction } from "./internal/actions";

type DesignStudioAction = Exclude<
	Action,
	{ readonly _tag: "KeyChanged" | "Tick" | "SignDismissed" }
>;

export const updateDesignStudio = (
	world: World,
	action: DesignStudioAction,
): World => updateDesignStudioAction(world, action);
