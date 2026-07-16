# Data-oriented ECS migration research

Date: 2026-07-15

## Recommendation

Lean further into ECS, but do it by introducing a **mutable runtime ECS behind an authored-to-runtime boundary**, not by translating every field in the current `World` into a `TypedArray` at once.

The target should be:

1. The Design Studio edits an immutable, human-readable **Authored Room**.
2. Entering play bakes that Authored Room into a separate **runtime ECS** with dense entity allocation, explicit component membership, cached queries, and structure-of-arrays (SoA) storage for hot numeric components.
3. Gameplay systems mutate that runtime ECS in a declared schedule.
4. Rendering extracts a presentation snapshot or render list from ECS queries.
5. Input, floor configuration, cameras, editor state, and UI state remain singleton resources or application state rather than becoming fake entities solely to fit them into arrays.

This is a large migration, but it can be incremental. A practical production path is approximately **10–16 focused pull requests** after a benchmark/prototype gate. Building a correct general-purpose archetype ECS in this repository would add several more substantial workstreams and is not recommended. If learning ECS storage internals is itself the goal, build a small packed sparse-set prototype and benchmark it, but do not make the whole game depend on it until entity recycling, query mutation, and precision behavior are proven.

For the production core, the best first candidate remains **bitECS 0.4 plus application-owned SoA components**, but only behind a project-owned typed runtime interface. Its official API deliberately leaves component representation to the application, supports SoA, AoS, tags, cached incremental queries, and optional versioned entity IDs. It does **not** generate storage from a typed schema, and a query result does not prove to TypeScript that `column[eid]` is defined. The prototype therefore has to pass a developer-experience/type-safety gate as well as a performance gate. [bitECS components](https://bitecs.dev/docs/component), [queries](https://bitecs.dev/docs/query), [TypeScript setup](https://bitecs.dev/docs/installation), [entity versioning](https://bitecs.dev/docs/entity)

The reason to do this now is primarily the stated learning and architecture goal, not measured performance pressure. The current initial Authored Room contains only 15 entities, so no source inspected establishes that component lookup is presently a bottleneck. The migration should be allowed to proceed for learning, but performance claims should remain benchmark-gated. The two follow-up write-ups do not justify replacing lit/SVG, preallocating a DOM pool, or exposing raw bitECS arrays to systems. They strengthen the case for a one-way render-extraction boundary and guarded structural commands, both of which fit the existing recommendation.

## Bottom line

Saishumin is **ECS-shaped but not yet data-oriented**:

- Entity identity is separate from component data.
- Components contain data, and gameplay logic lives in systems/helpers.
- Component presence is sparse.
- Systems already form the beginning of an explicit update pipeline.

However:

- Every component value is a heap object stored in a `ReadonlyMap`.
- Hot loops iterate one map and repeatedly join other component maps with `.get`.
- Per-frame movement frequently copies complete maps to change one or a few entities.
- `World` mixes entity components, singleton resources, authored data, input, UI/editor state, and frame bookkeeping.
- The renderer materializes templates into an array and sorts it every render.
- Spatial queries repeatedly scan all positions or obstacles, sometimes inside other scans.

So the project has adopted ECS's **semantic decomposition**, but not the dense storage, query, mutation, and scheduling model that produces data-oriented behavior.

## What the supplied note gets right—and where it is too absolute

### Right

The note is directionally correct that hot systems benefit when they iterate only matching entities and read tightly grouped numeric data. Archetype ECS implementations group entities with identical component sets and store each component as a tightly packed array within a chunk; removing an entity fills the gap with the last entity. [Unity archetypes and chunks](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/concepts-archetypes.html)

It is also correct that identity, data, and behavior should be separable, and that system ordering is a real dependency rather than an accidental call-stack detail. Bevy's scheduler requires ordering to be explicit when incompatible systems can observe different results, and records system access conflicts as schedule metadata. [Bevy system ordering](https://docs.rs/bevy/latest/bevy/ecs/system/index.html)

### Too absolute

#### “ECS means one global array indexed directly by the entity ID”

That is one storage design, not the definition of ECS. Common implementations include:

- **Entity-indexed SoA:** simple columns such as `Position.x[eid]`; easy to learn, but entity-space holes and versioned IDs require care.
- **Packed sparse sets:** a sparse entity-to-row index plus dense entity/value arrays; fast component insertion/removal and dense iteration, with an extra lookup for joins.
- **Archetype tables/chunks:** entities with the same component set share aligned packed columns; queries can iterate already-matched tables, while adding/removing a component moves a row between tables.

Bevy exposes table storage for cache-friendly iteration and sparse-set storage for faster component insertion/removal. [Bevy storage module](https://docs.rs/bevy_ecs/latest/bevy_ecs/storage/index.html), [storage trade-off](https://docs.rs/bevy_ecs/latest/bevy_ecs/component/enum.StorageType.html) Flecs is archetype-based and caches matching tables rather than searching individual entities for every reused query. [Flecs query architecture](https://www.flecs.dev/flecs/md_docs_2Queries.html)

Entity identity should also not be confused with a storage row. Reusing a bare integer can make an old reference silently point at a new entity. Mature ECS implementations include a generation/version in the handle; bitECS documents both immediate ID recycling and optional embedded versioning, while Bevy models an entity as an index plus generation. [bitECS entity lifecycle](https://bitecs.dev/docs/entity), [Bevy entity lifecycle](https://docs.rs/bevy/latest/bevy/ecs/entity/index.html)

#### “All components must be primitive TypedArrays”

Hot numeric components are the strongest candidates for SoA typed storage, but cold or irregular data does not need to be forced into it. bitECS 0.4 accepts SoA, AoS, TypedArrays, ordinary arrays, tags, and arbitrary JavaScript references as component stores. [bitECS component formats](https://bitecs.dev/docs/component) Flecs's own design guide explicitly calls “components can only be plain data types” a misconception. [Flecs design guide](https://www.flecs.dev/flecs/md_docs_2DesignWithFlecs.html)

For Saishumin, `Position`, `Body`, and `Elevation` are hot numeric data. `SignContent` is cold managed string data and belongs in a sparse side store. Static object references do not by themselves cause a collection on every frame; allocation rate and reachability do. The useful rule is therefore “do not allocate or pointer-chase in measured hot loops,” not “no JavaScript reference may exist in any component.”

#### “TypedArrays cannot resize”

A TypedArray has no `push`/`pop`, and a fixed backing buffer cannot grow. Current ECMAScript also specifies resizable `ArrayBuffer`s, and a length-tracking TypedArray view can follow its backing buffer. The specification permits implementations to grow in place or copy, and warns that later resizes may fail. [ECMAScript resizable buffers](https://tc39.es/ecma262/multipage/structured-data.html#sec-fixed-length-and-resizable-arraybuffer-objects), [implementation guidelines](https://tc39.es/ecma262/multipage/structured-data.html#sec-resizable-arraybuffer-guidelines)

Growth is still a runtime event worth controlling. Use geometric capacity growth and perform it at a structural-change boundary, not opportunistically halfway through a simulation query. Saishumin's editor is paused during gameplay, so the first implementation can size the runtime from the baked Authored Room plus modest headroom and rebuild between modes.

#### “Every deletion must defragment every component array”

Packed tables or sparse sets use swap-remove to keep a dense storage row, but direct entity-indexed columns can retain unused indices while query membership excludes dead entities. The important invariant is that hot iteration is over dense matching entities, not that every possible column is moved after every deletion. In this game, editor deletion currently occurs while simulation is paused, so rebuilding the small runtime on Play is simpler and safer than supporting arbitrary structural mutation inside every system on day one.

#### “Smaller systems are always more ECS”

System boundaries should describe coherent transformations and explicit read/write sets. Splitting a system only because it is long can introduce unnecessary passes over the same data. The useful split in this repo is by schedule and access pattern—input intent, navigation intent, locomotion, gravity/support, recovery, facing, camera, render extraction—not one function per arithmetic operation.

## Assessment of the follow-up material

The follow-up material contains two sound architectural ideas:

1. Simulation state should remain independent from its browser representation, with a one-way extraction step before presentation.
2. The authoring interface, invariant-enforcing commands, and runtime storage do not need to have the same shape.

Those ideas should be adopted. Several examples and performance claims around them are outdated or too absolute, however.

### DOM and SVG are presentation targets, not ECS storage

The DOM is a node tree and browser events can traverse its ancestor path during capture and bubbling. Browsers then derive additional style, layout, pre-paint, paint, and compositing structures from document state. It is fair to say that ECS storage locality does not remove those presentation costs. [WHATWG DOM tree and event dispatch](https://dom.spec.whatwg.org/), [Chromium rendering pipeline](https://developer.chrome.com/docs/chromium/blinkng)

It is not accurate to say that ECS “does not naturally pair well with the DOM” as a universal architectural rule. ECS can own simulation while DOM, SVG, Canvas, or GPU rendering consumes extracted presentation data. The renderer remains a replaceable adapter. Saishumin already mostly follows that ownership direction: `World` is passed into `gameSceneTemplate`, and pointer handlers dispatch application actions or invoke Design Studio interaction code rather than storing gameplay behavior in DOM nodes.

The concrete browser recommendations in the supplied text need the following corrections:

| Supplied claim | Assessment | Saishumin implication |
| --- | --- | --- |
| Put every entity in one flat absolutely positioned HTML container | Absolute positioning removes an HTML box from normal flow, but that does not mean a change can never cause other style, overflow, paint, or compositing work. CSS transforms do not affect surrounding CSS flow, though they can change overflow. [CSS positioning](https://www.w3.org/TR/css-position-3/), [CSS transforms](https://www.w3.org/TR/css-transforms-1/) | The game uses one SVG rendering tree, not one HTML box per entity. Entity artwork is already grouped into SVG fragments. Replacing it with flat positioned `div`s is not indicated. |
| Always use `translate3d` | Transform-only motion can avoid normal-flow layout in appropriate HTML designs, but layer promotion/compositor behavior is implementation- and content-dependent; Chromium warns that excessive layers can be slower and recommends measurement. [Chromium browser rendering](https://developer.chrome.com/blog/inside-browser-part3) | A transform-only entity representation is a possible renderer experiment, not an ECS requirement. Current projection, shadows, occlusion depth, and multi-shape SVG art make it a non-trivial template redesign. |
| Preallocate 1,000 hidden elements to eliminate GC stutter | No primary source supports the number or the guarantee. A retained pool consumes memory; `display: none` removes a subtree from the CSS box tree, while retained DOM references remain observable in memory tools. Modern browser engines also optimize DOM allocation. [CSS display](https://www.w3.org/TR/css-display-3/), [Chrome Memory tools](https://developer.chrome.com/docs/devtools/memory), [V8 DOM allocation work](https://v8.dev/blog/holiday-season-2023) | Runtime entity churn is currently tiny. Generic pooling would duplicate lit's DOM ownership and retain many complex SVG subtrees. Add it only if a churn benchmark identifies node creation/removal as a dominant cost. |
| Write only dirty elements | Avoiding unnecessary extraction and presentation work is sound, but a `LastPosition` component is not automatically the right model and “the DOM is slow to write” is not a useful budget. DOM/style changes can invalidate different rendering phases depending on the changed property and document. [Chrome performance timeline events](https://developer.chrome.com/docs/devtools/performance/timeline-reference), [RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture) | Start with a `presentationRevision` plus render-extraction records. Add per-entity/per-field change sets only after profiling shows whole extraction or template updates dominate. Do not pollute simulation queries with presentation-only copies by default. |
| Event delegation is required; element handlers are an ECS anti-pattern | Event bubbling makes delegation possible, not mandatory. The architectural requirement is that presentation translates input into an application action/command rather than mutating simulation storage ad hoc. [WHATWG event dispatch](https://dom.spec.whatwg.org/#concept-event-dispatch) | The existing lit handlers already funnel input into `dispatch`/interaction services. A temporary `Clicked` component would create structural churn and bypass the established action queue. Directly mutating a component mask from an event handler would also bypass bitECS bookkeeping. |
| DOM/SVG has a universal 2,000–5,000 moving-element ceiling | Unsupported. Browser, device, subtree complexity, CSS/SVG features, update pattern, and frame budget all affect the result. Chrome's guidance is to measure DOM size and correlate it with style/layout work, not rely on a fixed hard limit. [Chrome guidance on DOM size](https://web.dev/articles/dom-size-and-interactivity) | Establish Saishumin-specific visible-entity budgets. Count actual SVG nodes per game entity, not just ECS entities. Move to Canvas/WebGL only when representative profiles show presentation is over budget and a prototype improves it. |

The strongest rendering change from this follow-up is therefore **stable keyed render extraction**, not an imperative `DomSyncSystem` with a fixed node pool. Lit documents that subsequent renders update an existing template efficiently; for reordered lists, keyed `repeat` maintains item-to-DOM association and moves existing nodes. Saishumin depth-sorts its scene objects on every render, so render records should carry a stable presentation key and Stage 4 should compare the current mapped list against keyed `repeat`. [Lit template rendering](https://lit.dev/docs/api/templates/), [Lit keyed lists](https://lit.dev/docs/templates/lists/)

A suitable boundary is:

```text
Simulation queries
  -> RenderExtractionSystem
  -> readonly RenderRecord[] (stable key, kind, geometry/presentation facts, depth)
  -> lit/SVG adapter
  -> browser rendering pipeline
```

`RenderRecord` should contain data rather than `TemplateResult`s or DOM nodes. This lets Canvas/WebGL be evaluated later without changing gameplay systems. Extraction should initially remain once per completed application action/tick, guarded by an explicit presentation revision. If profiling later justifies finer work, the runtime can maintain changed-renderable IDs and structural add/remove sets.

### The claimed bitECS API is obsolete

The example using `defineComponent({ x: Types.f32 })`, `world.createEntity()`, and `world.createQuery(...).evaluate()` does not describe bitECS 0.4. Version 0.4 is a complete TypeScript rewrite. Its documented API uses `addEntity(world)`, arbitrary application-owned component references, `addComponent(world, eid, component)`, and `query(world, [components])`. SoA values are normally written directly as `Position.x[eid]`. [bitECS 0.4 introduction](https://bitecs.dev/docs/introduction), [components](https://bitecs.dev/docs/component), [queries](https://bitecs.dev/docs/query)

This invalidates three claims in the supplied example:

- bitECS 0.4 does not compile a typed schema into flattened arrays. The application creates and owns those arrays.
- `addComponent` does not accept the shown typed initialization object. The 0.4 `set(component, data)` helper requires an `onSet` observer implemented by the application, and the API reference types generic component data as `any`. [bitECS component `set`](https://bitecs.dev/docs/component#the-set-helper), [bitECS API reference](https://bitecs.dev/api)
- A successful component query is a runtime membership guarantee, not automatic TypeScript narrowing for separately owned arrays.

That last point matters especially in this repository. `noUncheckedIndexedAccess` is enabled and must remain enabled. bitECS's own installation guide says this option makes entity-indexed array reads include `undefined` and require checks. TypeScript's documentation explains that unchecked indexed fields gain `undefined` under the option, and the TypeScript team explicitly declines flow exceptions because array mutation can occur at any time. [bitECS TypeScript setup](https://bitecs.dev/docs/installation), [TypeScript `noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html), [TypeScript FAQ](https://github.com/microsoft/TypeScript/wiki/FAQ#additional-logic-in-nouncheckedindexedaccess)

Therefore “100% of the TypeScript safety” and “the system acts as a compiler-checked gatekeeper” are unsupported. Queries ensure membership in bitECS's runtime index. They do not prove that application-owned column capacity is sufficient, that a versioned handle was converted to its base ID, that a value is in a domain enum, or that a caller has not mutated storage incorrectly. TypeScript types are erased and do not enforce runtime invariants. [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types)

Miniplex is also mischaracterized by grouping it with a schema-to-SoA compiler. Its official README says entities are ordinary JavaScript objects, components are their properties, identity is normally object identity, and TypeScript provides typed queries over those objects. That is a coherent developer-experience-oriented ECS, but it does not automatically flatten objects into numeric columns. [Miniplex official README](https://github.com/hmans/miniplex/blob/main/packages/core/README.md#differences-from-other-ecs-libraries)

This distinction keeps the library choice clear:

- **Miniplex** is the stronger comparison if the primary goal becomes ergonomic semantic ECS over JavaScript objects.
- **bitECS 0.4** remains the stronger candidate for the stated goal of learning and applying data-oriented SoA storage, provided the project supplies a deep typed interface around it.

### The typed interface must be deeper than raw columns

Raw `Position.x[eid]` access should be private to the Simulation World implementation. Systems should receive narrow, typed query views or cursors that establish the component bundle and expose safe reads/writes, for example a locomotion iteration interface rather than public arrays. The implementation can then centralize:

- conversion from versioned handle to base storage ID;
- liveness, membership, capacity, and initialization checks;
- explicit handling of `number | undefined` without weakening compiler diagnostics;
- numeric codecs and domain-value validation;
- revision/change recording on writes;
- deferred structural commands.

The prototype must benchmark the cost and ergonomics of this interface. If it requires non-null assertions throughout systems, broad casts, or repetitive checks at every arithmetic expression, it has failed the project's type-safety gate even if the raw loop benchmark is fast. A cursor may validate a matched row once and offer defined values for the coherent operation; invariant failures inside the private implementation are defects, while authored/external input failures remain typed decode errors.

This does not hide ECS concepts. Query contracts, component bundles, read/write access, scheduling, and structural phases remain explicit. It hides storage hazards that unrelated gameplay modules should not need to re-solve.

### Mutually exclusive components require application invariants

The supplied text correctly says a low-level ECS can represent logically contradictory component combinations. Its description of the resulting bug is too specific: adding `Flying` and `Swimming` does not itself make systems overwrite each other; that occurs only if matching systems write conflicting state. Neither bitECS queries nor TypeScript automatically forbid the combination.

The suggested `Uint8Array` enum also does not restrict values to `0 | 1 | 2`; it stores an 8-bit numeric conversion. Domain validity still requires a codec or guarded setter. TypeScript cannot provide the runtime check after its types are erased. [ECMAScript TypedArray element types](https://tc39.es/ecma262/multipage/indexed-collections.html#table-the-typedarray-constructors), [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types)

bitECS 0.4 offers `makeExclusive` for **relation targets**—one target per subject—not for arbitrary groups of ordinary components. [bitECS exclusive relations](https://bitecs.dev/docs/relationships#makeexclusive--exclusive) Saishumin should enforce ordinary component invariants in its own runtime interface:

- Model truly exclusive state such as character kind, obstacle kind, decoration kind, facing, or a future movement mode as one validated code column when systems need exactly one value.
- Use separate tags for orthogonal facts that may combine, such as `Opened`, `Grounded`, or future status effects.
- Make low-level `addComponent`/`removeComponent` private. Expose tagged spawn commands and named transitions such as `spawnCharacter`, `spawnObstacle`, `changeMovementMode`, and `despawn`.
- Apply required bundles atomically: a character spawn can establish Position, Body/Elevation, Character kind, and presentation facts in one command rather than exposing a half-built entity to queries.
- Validate authored data during baking and assert runtime invariants in development, because a factory's TypeScript signature cannot prove its own implementation never attaches conflicting components.

The existing Effect `Schema.Literals` definitions are already the correct authored boundary. Baking can convert a validated string literal to an integer code; extraction or debugging can decode it. Do not replace a validated domain model with unvalidated numeric literals merely because storage is numeric.

### Authoring/runtime separation is real, but not universal code generation

Unity directly supports the supplied authoring/baking analogy: baking converts editor `GameObject` authoring data into runtime entities and components, with bakers declaring how conversion works. [Unity baking](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/baking.html), [Unity baker overview](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/baking-baker-overview.html)

Unreal Mass supports a related but different workflow. Its official documentation says entity templates are generated from editor `MassEntityConfig` assets and traits. Mass Representation can also choose an Actor, instanced mesh, or no representation per LOD and can pool Actors. That does not support the broader claim that Unreal generally takes an arbitrary authored Actor tree and compiles it into flat Mass storage when Play is pressed. [Unreal MassEntity templates and traits](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine), [Unreal Mass representation](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine)

Saishumin does not need a compiler, macro, or generator to get the benefit. An explicit, tested `bakeAuthoredRoom` module is sufficient. It should accept validated immutable authoring data, allocate dense runtime entities, attach complete bundles through the runtime command interface, and return authored↔runtime identity maps plus runtime resources. That is still a genuine authoring/storage separation.

### Net change to the recommendation

- **Unchanged:** preserve immutable authoring, bake a separate mutable runtime, use SoA selectively, keep SVG initially, and prototype bitECS 0.4 before committing.
- **Strengthened:** make the runtime a deep module with typed query views and atomic structural commands; validate exclusive states at both bake and runtime boundaries.
- **Added:** extract data-only render records with stable keys, evaluate lit keyed rendering, and profile browser pipeline phases and real SVG node counts.
- **Rejected as defaults:** public raw arrays, the obsolete bitECS schema example, Miniplex as automatic flattened storage, direct component-mask writes from DOM events, fixed-size element pools, a universal DOM entity ceiling, and an automatic Canvas/WebGL rewrite.

## Current architecture assessment

### Existing strengths

The domain language is already strong. [`CONTEXT.md`](../../CONTEXT.md) defines an Entity as stable identity with no data or behavior of its own and a Component as optional data attached to an Entity. [`src/world/components.ts`](../../src/world/components.ts) contains data schemas without gameplay methods. [`src/world/README.md`](../../src/world/README.md) also enforces the desired dependency direction: World code does not import gameplay, Design Studio, or rendering behavior.

The current component stores in [`src/world/world.ts`](../../src/world/world.ts) are separate maps for positions, elevations, bodies, obstacles, decorations, and characters. This is closer to sparse component storage than to an object tree. `MovementSystemService` already schedules player movement, movable-item gravity, lava-monster movement, and recovery in an explicit order. [`src/gameplay/movement/internal/movement-runtime.ts`](../../src/gameplay/movement/internal/movement-runtime.ts)

Effect is being used at application and lifecycle boundaries, not to wrap every arithmetic operation. The pinned reference repository confirms that the project is already using Effect's own `Graph.astar` implementation for navigation rather than inventing an error-hiding wrapper. [Effect `Graph.astar` at the pinned revision](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/effect/src/Graph.ts#L3525-L3645)

### Storage and mutation gaps

The central type stores both components and unrelated state in one immutable snapshot:

- component maps;
- Authored Room floor data;
- game and editor cameras;
- Design Studio state;
- pressed controls;
- opened chests and sign contents;
- interaction selections (`readingSign`, `grabbed`, `pushing`);
- frame time.

That shape is convenient for state snapshots but makes every caller depend on the full `World` representation. A repository scan found 32 of 48 non-test TypeScript files mention `World` directly. This means replacing the maps in place would create a broad flag-day migration.

Gameplay updates are copy-on-write. Examples include:

- player movement copies `positions` and `elevations` at the end of active ticks;
- moving or pushing a crate copies both stores, sometimes once per axis;
- each lava monster copies positions, elevations, and characters independently;
- falling movable items copies the elevation map before learning whether anything changed;
- editor operations copy every affected map, and deletion copies seven stores before removing one entity.

These copies are visible in [`movement-runtime.ts`](../../src/gameplay/movement/internal/movement-runtime.ts), [`lava-monster.ts`](../../src/gameplay/movement/internal/lava-monster.ts), [`movable-items.ts`](../../src/gameplay/movement/internal/movable-items.ts), and [`design-studio/internal/actions.ts`](../../src/design-studio/internal/actions.ts). There are dozens of world-derived `new Map(...)`/`new Set(...)` sites in production code.

The map layout also does joins in application code. Collision, support, elevation, movement, interaction, and rendering often iterate `positions` or `obstacles`, then fetch `Body`, `Elevation`, or kind data from other maps. This correctly models optional components, but it does not give a system a dense pre-matched stream.

### Algorithmic and presentation limits

Data layout is not the only scaling limit. Several spatial operations are full scans, and crate collision/push logic contains scans inside scans. [`src/world/spatial/collision.ts`](../../src/world/spatial/collision.ts), [`src/world/spatial/elevation.ts`](../../src/world/spatial/elevation.ts), [`src/world/spatial/support-surface.ts`](../../src/world/spatial/support-surface.ts), and [`src/gameplay/movement/internal/movement-runtime.ts`](../../src/gameplay/movement/internal/movement-runtime.ts)

At high entity counts, replacing map lookups with typed columns would not change those algorithms' asymptotic cost. A uniform grid, spatial hash, sweep-and-prune structure, or another broad phase would become a separate required track once profiling shows spatial scans dominate.

Rendering similarly creates a `RenderedObject[]`, constructs lit/SVG templates, sorts by depth, and renders the SVG tree. [`src/rendering/internal/game-scene.ts`](../../src/rendering/internal/game-scene.ts) Lit reuses an existing compatible template and updates its dynamic parts, so this is not equivalent to blindly recreating the entire DOM every frame; however, the application still rebuilds render descriptions/templates and supplies a position-based mapped list. [Lit template rendering](https://lit.dev/docs/api/templates/) TypedArrays do not make extraction, browser updates, or a per-frame sort disappear. Stage 4 should introduce data-only records with stable presentation keys and compare mapped rendering with keyed `repeat` under depth reordering. If the intended future scale is thousands of visible moving entities, Canvas/WebGL and batching/instancing would be a later presentation migration. The ECS benchmark must measure simulation separately from rendering so a presentation ceiling is not misdiagnosed as ECS storage failure.

### Authoring and HMR constraints

The Design Studio is deeply based on immutable value snapshots. An Edit Session stores an operation and computes a preview `World` by applying that operation to copied maps; commit adopts it and cancel discards it. [`src/design-studio/edit-session/edit-session.ts`](../../src/design-studio/edit-session/edit-session.ts) This is a good authoring model and a poor reason to keep copying runtime simulation data every frame.

Separating flexible authoring data from optimized runtime data is an established ECS workflow. Unity's baking pipeline explicitly converts flexible, human-oriented authoring data into runtime entities/components and supports incremental rebaking for editor feedback. [Unity authoring/runtime split](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/baking-overview.html), [Baker model](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/baking-baker-overview.html)

Otaku State does not serialize the World to disk. It keeps the live value in `import.meta.hot.data` and exposes it through an Effect `Ref`. [`vendor/otaku/packages/otaku-state/src/index.ts`](../../vendor/otaku/packages/otaku-state/src/index.ts) That makes the persistence problem lighter than it first appears. On HMR, keep/reconcile the Authored Room and rebuild runtime ECS storage from it rather than attempting to migrate an old typed-memory layout in place.

## Storage alternatives for this repo

| Choice | What it provides | Migration difficulty | Fit |
| --- | --- | --- | --- |
| Keep maps, improve system APIs | Better seams and less copying, but no dense component iteration | Medium | Good preliminary refactor, not the full learning goal |
| bitECS membership/query core + private owned SoA | Versionable entity allocation, component membership, cached queries, flexible stores; the game owns schemas, storage safety, commands, and systems | Large | **Recommended production target if the typed-interface spike passes** |
| Miniplex object ECS | Strong TypeScript ergonomics and archetypal queries over normal object entities | Medium-large | Useful DX comparator; does not satisfy the SoA/data-layout learning goal |
| Small custom packed sparse-set ECS | Dense per-component storage and direct learning of swap-remove, sparse indices, generations, query joins | Very large | Good bounded prototype; production only after adversarial tests |
| Custom archetype/table ECS | Aligned packed columns and cached table queries; component changes move entities between tables | Extreme | Educational engine project, disproportionate to this 15-entity game |
| Naive raw-ID-indexed TypedArrays + bitmask | Minimal code and mirrors the supplied example | Medium initially, high later | Reject as final design: stable authored IDs are sparse, deletion/reuse is unsafe, and more than 32/64 components complicate a single mask |

bitECS 0.4 is not a promise that every component is automatically packed into TypedArrays. Its component stores are application-owned, and it permits regular arrays as well as TypedArrays. Its query result is a cached list of matching entity IDs, but raw indexed reads remain possibly undefined under this repository's compiler configuration. That is still a useful compromise here: bake sparse authored IDs such as 100–401 into dense runtime entities, use versioning for handles, deliberately choose SoA only for hot data, and expose validated query views rather than columns. [bitECS world and shared index](https://bitecs.dev/docs/world), [component storage](https://bitecs.dev/docs/component), [cached queries](https://bitecs.dev/docs/query), [TypeScript setup](https://bitecs.dev/docs/installation)

If the team decides to write the ECS core for learning, keep the module intentionally narrow:

- entity allocator with index + generation;
- liveness validation;
- component registration and membership;
- packed sparse-set storage with swap-remove;
- query intersection/caching;
- deferred structural command buffer;
- capacity growth;
- typed query views/commands, invariants, and benchmark suite.

Do not start with relationships, hierarchy, parallel execution, reflection, serialization, networking, or a general scheduler. Mature engines treat structural changes as a special phase because mutation can invalidate active queries; Bevy queues structural `Commands` and applies them at an `ApplyDeferred` boundary. [Bevy Commands](https://docs.rs/bevy_ecs/latest/bevy_ecs/system/struct.Commands.html)

## Proposed runtime model

The existing domain term **World** should remain the complete application/runtime snapshot. Introduce a new term—provisionally **Simulation World**—for the packed gameplay ECS inside it, and add that term to the domain glossary before implementation.

```text
World
├── authoredRoom          immutable editor-friendly data
├── simulation           mutable ECS, rebuilt/baked for play
│   ├── entities         index + generation allocator
│   ├── components       private membership + SoA/side stores
│   ├── interface        typed queries, atomic commands, validated transitions
│   ├── queries          cached matching entity IDs behind typed views
│   └── revisions        structural/data/presentation versions
├── simulationResources  floor bounds, input intent, time, camera target
└── interfaceState       Design Studio, dialogs, selections, camera
```

ECS libraries also distinguish components from unique resources. Bevy defines resources as singleton-like values stored in a World and accessed by systems. [Bevy resources](https://docs.rs/bevy/latest/bevy/ecs/resource/index.html) Saishumin should make that distinction explicit rather than treating every value as an entity component.

### Component and resource mapping

| Current field | Runtime representation | Reason |
| --- | --- | --- |
| `positions` | `Position.x`, `Position.y` SoA numeric columns | Hot in movement, spatial queries, render extraction |
| `bodies` | `Body.width`, `Body.depth` SoA numeric columns | Hot, commonly joined with Position |
| `elevations` | `Elevation.z`, `Elevation.velocity` SoA numeric columns | Hot in locomotion/support/render extraction |
| `obstacles` | `Obstacle` membership/tag + kind integer + height numeric column | Hot membership/kind; string kind need not be stored per row |
| `decorations` | `Decoration` membership + kind integer + height numeric column | Mostly rendering/editor; still queryable |
| `characters` | `Character` membership + kind/facing integer columns | Hot for character queries and render extraction |
| `openedChests` | `Opened` tag on chest entities | Presence is the state |
| `signContents` | managed sparse component store keyed by validated entity handle | Cold strings; no benefit from numeric SoA |
| `readingSign`, `grabbed`, `pushing` | nullable entity-handle resources | Exactly one current relationship at a time |
| `pressed` | input resource/bitset | Global input, not per-entity data |
| floor plan/origin/tiles | Authored Room + simulation resource | Singleton environment data |
| game/editor camera | separate resources/interface state | Singleton view state |
| `editor` | interface/authoring state | Not runtime simulation component data |
| `lastFrame` | time resource | Singleton schedule input |

Use integer enum codecs at the boundary rather than scattering numeric literals. The existing `Schema.Literals` definitions remain useful for authored data and validation; baking converts their values to compact runtime codes, and extraction converts back only where a public view needs the domain type.

### Numeric precision

Do **not** start by changing every numeric field to `Float32Array`. Current component schemas use JavaScript `number`, whose finite values use ECMAScript's IEEE-754 binary64 Number representation. A `Float32Array` stores 32-bit binary floating-point values and therefore rounds many existing numbers. [ECMAScript Number type](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-number-type), [TypedArray element types](https://tc39.es/ecma262/multipage/indexed-collections.html#table-the-typedarray-constructors)

This game currently contains exact comparisons between elevations, support heights, positions, and zero velocity. Silent precision reduction could change collision/support decisions. Start with `Float64Array` for Position, Body, Elevation, and heights. Treat an eventual Float32 experiment as a separate benchmark with tolerance/quantization decisions and parity tests.

### Identity

Keep authored stable IDs separate from runtime storage:

```text
AuthoredEntityId  --bake map-->  RuntimeEntity(index, generation)
RuntimeEntity     --source map--> AuthoredEntityId (when needed by editor/persistence)
```

Never expose a packed storage row as stable identity. Swap-remove is free to relocate a component row while the entity handle remains valid. Every entity-valued resource or managed side store must validate the generation before dereferencing. If bitECS versioning is enabled, its docs warn that the versioned numeric handle may be much larger than the base array index; component access must consistently use the base ID. [bitECS versioned ID trade-offs](https://bitecs.dev/docs/entity)

### System schedule

The first schedule can remain single-threaded and explicit:

1. **Input action handling** updates input/resources or emits structural commands.
2. **Player intent** derives desired movement/jump/grab/interact intent.
3. **Navigation intent** queries lava monsters and computes desired actor actions.
4. **Actor locomotion** advances all actors sharing locomotion rules.
5. **Movable-item gravity/support** advances crates and other movable entities.
6. **Spatial recovery** repairs invalid positions after movement/structural changes.
7. **Facing/presentation state** derives facing and animation-relevant state.
8. **Camera** follows the player resource/query result.
9. **Render extraction** creates a render list/snapshot and depth order.
10. Apply deferred structural commands at a documented boundary.

This schedule should record each system's required query and resource reads/writes even before parallelism exists. System ordering then becomes reviewable architecture, not hidden knowledge in a nested function. The current movement pipeline at the end of `movement-runtime.ts` is the seed for this schedule, not code to discard wholesale.

### Change detection

Mutability breaks the current render trigger. [`src/app/main.ts`](../../src/app/main.ts) decides whether to render by comparing map and object references. In-place ECS writes preserve those references.

Introduce explicit versions or dirty sets:

- `simulationRevision` for any gameplay-visible data change;
- `structuralRevision` for entity/component membership changes;
- `presentationRevision` or per-component change ticks for render-relevant changes;
- an explicit editor revision for authoring previews.

At the current scale, incrementing one presentation revision and rendering once after a completed action/tick is enough. Per-component/per-entity dirty tracking should be added only if extraction profiling warrants it.

Do not make `LastPosition` a simulation component solely so the DOM adapter can compare values. If finer change detection becomes necessary, keep presentation change ticks/sets as runtime bookkeeping owned by the extraction seam. A Position write can record the entity as presentation-dirty; the renderer can consume the resulting changed IDs after the scheduled tick.

## Concrete migration plan

Each stage should leave the game shippable and preserve the existing `World` interface through adapters until callers move.

### Stage 0 — establish gates (small, 1 PR)

- Add simulation-only benchmarks for 15, 1,000, and 10,000 synthetic entities.
- Measure player/actor integration, support queries, collision candidate scans, render extraction, template creation, and full-frame cost separately.
- Add representative browser profiles for stable motion, depth reordering, and spawn/despawn churn. Record actual SVG node counts and separate scripting, style/layout, paint, and compositing time.
- Record allocations/GC and p50/p95/p99 time after warm-up.
- Add behavior fixtures for jumping, crate chains, stacked support, lava-monster routing, editor preview/commit/cancel, entity deletion, HMR reconciliation, and render depth.
- Add compile-only interface fixtures proving systems receive defined component values while invalid spawn/transition payloads fail type checking; keep runtime decode/invariant tests because TypeScript types are erased.
- Define the future target scale. Without it, “extreme performance” is not falsifiable.

### Stage 1 — deepen the existing seam (medium, 1–2 PRs)

- Stop exporting raw component maps as the only interface used by systems.
- Add narrow query/read/write interfaces under the World module while their implementation still delegates to maps.
- Introduce explicit component query names such as `charactersWithMotion`, `solidSpatialEntities`, `fallingMovables`, and `renderableEntities`.
- Separate resources from component stores at the type level without changing behavior.
- Add explicit revision-based render triggering while retaining immutable maps.

This stage reduces the 32-file blast radius and lets old and new storage implementations run behind the same tests.

### Stage 2 — prototype the runtime core and bake boundary (large, 1–2 PRs)

- Spike bitECS 0.4 with versioned allocation and application-owned `Float64Array`/integer columns.
- Keep all bitECS component mutation and entity-indexed column access private to the spike. Expose at least one typed query cursor and atomic spawn/despawn/transition command interface.
- In parallel only as a disposable learning benchmark, implement one packed sparse-set `Position` + `Velocity`/`Elevation` prototype if learning the storage mechanics is important.
- Bake the current initial Authored Room into dense runtime entities; retain authored↔runtime maps.
- Rebuild the runtime on HMR and on transition from the Design Studio to play.
- Prove create, delete, recycle, stale-handle rejection, capacity growth, nested-query behavior, complete component bundles, and exclusive-state transitions.
- Choose the core only after benchmark, type-check, and system-authoring results. The project's `noUncheckedIndexedAccess` must remain enabled; do not weaken `tsconfig` diagnostics to make indexed component access convenient.

### Stage 3 — port spatial facts and locomotion (very large, 3–4 PRs)

- Port `collision.ts`, `elevation.ts`, `support-surface.ts`, and player/lava-monster placement to query interfaces.
- Port player and lava-monster motion to mutate component columns in place.
- Generalize shared actor locomotion so player input and AI navigation produce the same actor intent where the rules are genuinely shared.
- Replace repeated per-entity map copies with one scheduled mutation phase.
- Keep navigation graph construction as managed data; it is not a hot numeric component store.
- Add a simple spatial index only after the benchmarks show full scans dominate. Build/update it as a system or resource with explicit invalidation on Position/Body/Obstacle changes.

This is the highest gameplay-risk stage because current collision, support, pushing, gravity, and recovery rules are tightly coupled through exact values and iteration order.

### Stage 4 — extract rendering from runtime ECS (medium-large, 1–2 PRs)

- Replace direct map iteration in `game-scene.ts` with render queries and data-only `RenderRecord`s; keep lit/SVG outside the Simulation World module.
- Preserve authored IDs or allocate a separate stable presentation key. Compare the current mapped list against lit's keyed `repeat`, especially under depth reordering and insertion/removal.
- Make depth sorting an explicit presentation step; benchmark incremental ordering only if sorting dominates.
- Retain current action-dispatching pointer handlers. Do not introduce temporary input components or direct mask mutation unless gameplay semantics require queued simulation input.
- Benchmark, but do not assume, per-entity dirty extraction and transform-only SVG groups. Pooling is considered only if measured node churn dominates after keyed identity is in place.
- Keep the SVG/lit renderer initially. Canvas/WebGL is an independent scale decision, not a prerequisite for ECS correctness.

### Stage 5 — make the Design Studio authoring-only (very large, 2–3 PRs)

- Define an `AuthoredRoom` value schema containing editor items, authored floor, and stable authored IDs.
- Make Edit Session preview/commit/cancel operate only on that value.
- Bake a fresh Simulation World on Play. At 15 entities this is simpler than live incremental mutation and guarantees no abandoned runtime rows.
- Keep transient gameplay facts—velocity, opened state, current targets—out of authored data unless the product explicitly wants them persisted.
- Later, if live play-while-editing is desired, add incremental baking with declared dependencies. Unity's own incremental baking model illustrates why this is a separate complexity tier. [Unity baking dependencies](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/baking-baker-overview.html)

### Stage 6 — remove compatibility maps and harden lifecycle (medium, 1–2 PRs)

- Delete the old component-map representation only after no production caller imports it.
- Centralize spawn/despawn/component structural commands and make raw bitECS structural APIs inaccessible outside the runtime implementation.
- Add invariant checks in development: live handle, unique player, required component bundles, valid enum codes, dense/sparse inverse mapping, and side-store cleanup.
- Keep snapshot/export codecs at the boundary rather than exposing raw buffers as the domain model.
- Document the final module interface and update the domain glossary/ADR.

## Affected modules

| Area | Files/modules | Required change |
| --- | --- | --- |
| Domain/data | `src/world/components.ts`, `entity-id.ts`, `world.ts` | Preserve authored schemas; add runtime codecs, entity handle, resources, query interface |
| Construction/HMR | `initial-world.ts`, `internal/make-initial-world.ts`, `reconcile-world.ts` | Produce/reconcile Authored Room; bake/rebuild Simulation World |
| Spatial | `world/spatial/*` | Consume component queries; later consume spatial-index candidates rather than full maps |
| Player movement | `movement-runtime.ts`, `movable-items.ts`, recovery/placement modules | In-place system passes, shared actor intent/locomotion, no whole-store copies |
| Lava monster | `lava-monster.ts`, `lava-monster-navigation.ts`, `navigation.ts` | Query characters with motion; retain graph/plans as managed system state/resource |
| Update/application | `update-system.ts`, `app/main.ts`, `world-update.ts` | Explicit schedule/resources/revisions; render trigger no longer based on reference identity |
| Rendering | `rendering/internal/game-scene.ts`, presentation geometry | Render extraction query and stable presentation identity; preserve SVG first |
| Design Studio | edit-session, placement, interaction, actions, view | Move to Authored Room value; use bake boundary and authored IDs |
| Tests | most World/spatial/gameplay/editor tests | Test through fixtures/query interfaces; add dual-run parity during migration |

## Verification and benchmark gates

### Correctness gates

- Existing tests pass unchanged through a compatibility adapter before being migrated.
- A dual-run harness applies the same action/tick sequence to map-backed and ECS-backed simulations and compares extracted domain snapshots.
- Entity deletion/reuse tests prove a stale handle cannot read or modify the replacement entity.
- Swap-remove tests cover removal of first, middle, last, only, and absent component rows.
- Structural changes made during query iteration are either rejected or deferred and are visible at the documented boundary.
- Invalid exclusive-state transitions and incomplete entity bundles cannot enter query-visible runtime state through the public command interface.
- HMR preserves Authored Room changes and reconstructs a valid runtime.
- Design Studio preview never mutates committed authoring data or live simulation data.
- Numeric parity runs on `Float64Array` first. Float32 is not adopted until movement/support/collision scenarios pass under an explicit tolerance policy.
- Compile-only fixtures pass with `noUncheckedIndexedAccess` and all existing diagnostic severities unchanged; gameplay systems do not use casts or non-null assertions to access component columns.
- Render extraction produces stable keys across movement and correct key changes across despawn/recycle; SVG behavior remains correct when depth order changes.

### Performance gates

- Benchmark simulation and rendering separately.
- Compare current maps, bitECS + SoA, and the optional packed sparse-set prototype under the same generated worlds.
- Measure idle tick, moving actors, falling movables, high collision density, entity churn, and render extraction.
- Report distributions after warm-up, not a single best run.
- Track bytes/allocations per simulation tick and long-frame frequency, not only operations per second.
- Require zero whole-component-store clones in the runtime tick after the ECS port.
- Set a p99 frame/simulation budget only after the intended entity/visible-entity target is named.
- For browser presentation, report SVG/DOM node count and Chrome pipeline slices rather than asserting a universal entity-count ceiling.

Do not claim a speedup from layout alone if the profile is dominated by nested spatial scans, A* rebuilding, template construction, SVG diffing, or depth sorting. Optimize the measured dominant term.

## Risks and trade-offs

### The migration may make the 15-entity game slower

Query bookkeeping, codecs, extraction, and authored/runtime synchronization all have fixed overhead. The migration is still defensible as deliberate ECS learning and as preparation for scale, but not as a guaranteed current-frame optimization.

### Mutable storage changes the programming model

Current immutable `World` values make preview and cancellation cheap to reason about. A runtime ECS needs explicit snapshot/extraction boundaries, revisions, and structural command phases. Keeping the Design Studio on authored values contains most of that cost.

### Storage can leak through every module

Direct `Position.x[eid]` access everywhere would merely replace public maps with public arrays. It would also spread `number | undefined` handling and version/base-ID hazards throughout the application. Keep component columns private to the runtime module and expose narrow query cursors/system views so capacity, versioning, invariants, and storage strategy can change without another repository-wide migration.

### Over-generalizing the ECS core would consume the game

Archetype graphs, relationship tables, reflection, generic serialization, multithreading, and a dynamic scheduler are each engine projects. Flecs and Bevy demonstrate how deep those facilities become. Use an existing membership/query core or keep a custom core intentionally small.

### “Pure ECS” can become cargo cult architecture

Resources, managed cold components, graph state, assets, and UI are legitimate. The goal is predictable access and ownership in hot simulation paths, not maximizing the number of arrays. The component should not own game behavior, but a blanket ban on all complex values is not supported by the primary ECS implementations reviewed.

## Decision record to make before implementation

Record an ADR answering these questions:

1. What future entity count and visible-entity count are we designing for?
2. Is the primary goal learning ECS application design, ECS storage implementation, or shipping scale?
3. Are authored stable IDs allowed to differ from runtime handles? The recommendation is yes.
4. Is runtime rebuilt on every transition to Play? The recommendation is yes initially.
5. Is `Float64Array` the initial numeric representation? The recommendation is yes.
6. Are structural changes forbidden/deferred during simulation queries? The recommendation is yes.
7. Is bitECS acceptable as the entity/query core, with a custom sparse-set retained only as a learning spike? The recommendation is yes.
8. What typed query/command interface will keep raw columns and structural operations private while preserving useful ECS concepts?
9. What measured browser result would justify per-entity dirty extraction, pooling, transform-only SVG, or a Canvas/WebGL migration?

With those decisions made, the migration is difficult but tractable. Without them, “be more ECS” risks becoming a long rewrite in which storage decisions, editor semantics, and performance targets change simultaneously.
