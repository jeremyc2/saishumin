import { Brand, Schema } from "effect";

export type EntityId = Brand.Branded<number, "EntityId">;

export const EntityId: Brand.Constructor<EntityId> = Brand.check<EntityId>(
	Schema.isInt(),
	Schema.isGreaterThan(0),
);
