import { nothing as litNothing, type TemplateResult } from "lit-html";

declare const LitNothingTypeId: unique symbol;

export type LitNothing = {
	readonly [LitNothingTypeId]: never;
};

/**
 * Lit's `nothing` sentinel with an opaque non-symbol compile-time type.
 *
 * This works around `@effect/language-service` treating tagged-template
 * substitutions containing Lit's unique-symbol sentinel as string interpolation.
 * The exported runtime value is still Lit's original sentinel.
 *
 * @see ../../docs/research/lit-nothing-ts2731.md
 */
export const nothing = litNothing as unknown as LitNothing;

export type LitTemplate = TemplateResult | LitNothing;
