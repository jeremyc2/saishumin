import { Data } from "effect";
import type { Control } from "./control";

export type Action = Data.TaggedEnum<{
	KeyChanged: { readonly key: Control; readonly pressed: boolean };
	Tick: { readonly time: number };
}>;

export const Action = Data.taggedEnum<Action>();
