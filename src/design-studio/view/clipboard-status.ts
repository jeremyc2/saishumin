import { Effect } from "effect";
import type { World } from "../../world/world";

export type ClipboardButtonStatus = {
	readonly label: string;
	readonly disabled: boolean;
};

export const loadClipboardWithStatus = <E>({
	load,
	onLoaded,
	setStatus,
}: {
	readonly load: Effect.Effect<World, E>;
	readonly onLoaded: (world: World) => void;
	readonly setStatus: (status: ClipboardButtonStatus) => Effect.Effect<void>;
}): Effect.Effect<void> =>
	setStatus({ label: "LOADING…", disabled: true }).pipe(
		Effect.andThen(load),
		Effect.matchEffect({
			onFailure: () =>
				setStatus({
					label: "LOAD FAILED — CHECK DATA",
					disabled: false,
				}),
			onSuccess: (world) =>
				Effect.sync(() => onLoaded(world)).pipe(
					Effect.andThen(
						setStatus({
							label: "LOAD FROM CLIPBOARD",
							disabled: false,
						}),
					),
				),
		}),
	);
