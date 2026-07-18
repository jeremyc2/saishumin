# Lit `nothing` and TS2731 research

Date: 2026-07-18

## Conclusion

Normal Lit usage does **not** require casting `nothing` to `unknown` or `any`. The intended form is simply:

```ts
html`${condition ? html`<button>DELETE</button>` : nothing}`
```

Lit publishes `nothing` as a symbol sentinel, types every `html`/`svg` substitution parameter as `unknown`, and shows the direct, uncast form in its own API documentation and source example. The `unknown[]` parameter means Lit accepts heterogeneous expression values; it is not an instruction for callers to cast each value to `unknown`. [`lit-html` source: tag signature and `nothing` example](https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/lit-html.ts#L553-L555), [`nothing` documentation and declaration](https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/lit-html.ts#L660-L679)

The cast needed in this repository is a workaround for the configured `@effect/language-service` plugin, not for Lit and not for TypeScript 7 itself. In the local isolation, removing the plugin from an otherwise identical project configuration removed all 17 TS2731 diagnostics. The same direct interpolation passed with TypeScript 5.9.3, TypeScript 6.0.2, and the repository's TypeScript 7.0.2 compiler when that plugin was disabled.

As of 2026-07-18, no existing Lit, TypeScript, TypeScript-Go, or Effect language-service issue or discussion was found for this exact tagged-template false positive after searching their issue and pull-request trackers for `TS2731`, `tagged template`, `symbol`, `lit-html`, `nothing`, and the cast forms. This appears to be unreported. The appropriate tracker is likely [`Effect-TS/language-service`](https://github.com/Effect-TS/language-service/issues), because enabling that plugin is the isolated trigger.

## Why the diagnostic is wrong here

TS2731 is valid for an **ordinary** JavaScript template literal such as `` `${someSymbol}` ``, because JavaScript tries to coerce the symbol to a string and throws. The TypeScript issue that introduced this check is explicitly about those runtime coercions. [TypeScript #19666](https://github.com/microsoft/TypeScript/issues/19666)

A tagged template is different: JavaScript passes substitutions as arguments to the tag function. Lit's tag accepts `...values: unknown[]` and interprets the `nothing` sentinel itself; it does not perform JavaScript template-string coercion. Lit's own tests interpolate `nothing` directly without casts. [`lit-html` test](https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/test/lit-html_test.ts#L2623), [Lit SSR render fixture](https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/labs/ssr/src/test/test-files/render-test-module.ts#L214)

The cast works only because hiding `typeof nothing` behind a non-symbol compile-time type avoids the faulty diagnostic. It is not part of Lit's API contract and does not help Lit at runtime.

## Repository workaround

The workaround is centralized in [`src/presentation/lit-template.ts`](../../src/presentation/lit-template.ts). That module:

- imports Lit's real `nothing` sentinel;
- asserts it once to the opaque object type `LitNothing`;
- exports `LitTemplate` as `TemplateResult | LitNothing`; and
- lets application templates interpolate `nothing` and `LitTemplate` values without local casts.

The assertion changes only the compile-time view of the value. At runtime, the exported value is still Lit's original sentinel and is recognized by identity. `LitNothing` deliberately is not typed as `string`: a string is renderable content with different semantics, whereas Lit's `nothing` clears a child part, removes an attribute, or becomes `undefined` in a property expression. [`nothing` API documentation](https://lit.dev/docs/api/templates/#nothing)

This cannot be expressed as an override of TypeScript's `unknown`: `unknown` is a built-in type, not a declaration exported by `lit-html`. Module augmentation merges patches into existing declarations and cannot replace the type of Lit's exported value declaration, so a local value facade is the narrowest place to contain the compatibility assertion. [TypeScript module augmentation documentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation)

This compatibility type should be deleted when the language-service false positive is fixed. At that point, application code should import Lit's `nothing` directly, and `LitTemplate` can use `TemplateResult | typeof nothing` if the project still needs an explicit helper return type.

## Related Lit discussion

Lit maintainers have discussed exporting a precise `Renderable` type, including `typeof nothing`, because Lit currently accepts a broad range of substitution values. That discussion is about annotating function inputs and return values, not about casting template substitutions. [Lit #1170](https://github.com/lit/lit/issues/1170), [Lit #5121, including the maintainer's proposed union](https://github.com/lit/lit/issues/5121#issuecomment-3402870454)

Without the language-service false positive, `TemplateResult | typeof nothing` is the accurate narrow return type for functions in this codebase that may render nothing. While the workaround is needed, the repository uses the equivalent compatibility union `TemplateResult | LitNothing`, exported as `LitTemplate`.

## Local isolation

The repository was copied to a temporary directory, all newly added `as unknown` casts were removed, and typechecking was run twice with the same TypeScript 7.0.2 binary and compiler options:

| Configuration | Result |
| --- | --- |
| Existing `@effect/language-service` plugin enabled | 17 × TS2731 |
| Only the `plugins` entry removed | Pass |

Minimal direct `nothing` interpolation also passed under TypeScript 5.9.3, 6.0.2, and 7.0.2 without the plugin. No application source files were changed during this isolation.
