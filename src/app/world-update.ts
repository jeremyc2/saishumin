import { cameraFollowingPlayer } from "../presentation/geometry/projection";
import type { World } from "../world/world";
import { Action, type Action as AppAction } from "./action";

export const completeWorldUpdate = ({
	previous,
	updated,
	action,
}: {
	readonly previous: World;
	readonly updated: World;
	readonly action: AppAction;
}): World => {
	if (!Action.$is("Tick")(action) || updated.editor.open) return updated;
	return {
		...updated,
		gameCamera: cameraFollowingPlayer({
			world: updated,
			camera: previous.gameCamera,
		}),
	};
};
