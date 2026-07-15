# Lava monster navigation research

Date: 2026-07-14

## Recommendation

Use A* over a small **action graph**, then execute the chosen actions through the same locomotion and collision code as the player.

For this room, the action graph should be a configuration-space visibility graph rather than a frame-local grid:

- Expand each solid axis-aligned footprint by the lava monster's half-width and half-depth. This turns the finite-size monster into a point for route planning while preserving the clearance its body needs.
- Create walk nodes at the resulting corners and at useful takeoff, landing, and follow positions. Keep the support elevation on every node.
- Add a walk edge only when the whole segment is clear at that support elevation.
- Add a directed, action-labelled jump or drop edge only when the shared actor physics says the complete trajectory is possible and the landing is valid.
- Search to the cheapest valid point in a follow-distance ring around the player, not to the player's occupied position.

The AI layer should output the same small intent vocabulary as player input: movement direction and whether to start a jump. A generalized actor-locomotion function should remain authoritative for collision, gravity, landing, and solidity. The monster starts a jump only when the next planned edge is a jump; the player's airborne state is irrelevant.

This split follows Reynolds's useful distinction between action selection, steering, and locomotion. His paper also explicitly treats pathfinding as separate from steering: a planned route can specify the path that steering follows. [Craig Reynolds, *Steering Behaviors for Autonomous Characters* (1999)](https://www.red3d.com/cwr/steer/gdc99/)

## Why this is the smallest maintainable fit

The room is small, its obstacles have axis-aligned rectangular footprints, and there is one follower. A visibility graph has only obstacle corners and traversal points rather than hundreds of always-present grid cells. The classic configuration-space approach plans collision-free paths for a finite-size body by reasoning about the body relative to obstacle boundaries; for rectangles, the required expansion and corner candidates are simple. [Lozano-Pérez and Wesley, *An Algorithm for Planning Collision-Free Paths Among Polyhedral Obstacles* (1979)](https://research.ibm.com/publications/an-algorithm-for-planning-collision-free-paths-among-polyhedral-obstacles)

A* is the appropriate least-cost search once nodes and edges accurately describe the actions the monster can perform. With a lower-bound heuristic, it efficiently focuses graph search toward the goal. [Hart, Nilsson, and Raphael, *A Formal Basis for the Heuristic Determination of Minimum Cost Paths* (1968)](https://doi.org/10.1109/TSSC.1968.300136)

No new pathfinding dependency is necessary. The existing Effect version already provides `Graph.astar`, including path reconstruction, unreachable-target handling, edge-cost validation, and the consistency requirement for its heuristic. [Effect `Graph.astar` source at the repository's pinned reference revision](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/effect/src/Graph.ts#L3525-L3645)

The current implementation in [`movement-system-service.ts`](../../src/systems/movement-system-service.ts) searches a same-elevation grid and decides jumping with a separate straight-line obstacle probe. Those two models can disagree: the route does not contain a jump, takeoff point, landing point, or support-elevation transition. An action graph makes a jump part of the route and lets locomotion determine whether it actually succeeds.

## Approach comparison

| Approach | What it is good at | Fit here |
| --- | --- | --- |
| Direct pursuit / seek-arrival steering | Natural movement toward a visible target and smooth arrival. | Keep as a clear-line shortcut and for following the next waypoint. It cannot solve a blocked route by itself; Reynolds describes pathfinding as a separate layer. [Reynolds (1999)](https://www.red3d.com/cwr/steer/gdc99/) |
| Reactive obstacle avoidance | Local collision prediction around moving agents and small obstacles. | Optional polish only. It must not decide solidity or global routing. Godot documents that avoidance is separate from physics and navigation-path computation, and that dynamic avoidance is unreliable for constraining agents in narrow spaces. [Godot NavigationAgents](https://docs.godotengine.org/en/4.5/tutorials/navigation/navigation_using_navigationagents.html), [Godot NavigationObstacles](https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationobstacles.html) |
| Dense-grid A* | Simple occupancy updates and robust routing through grid-shaped worlds. | Viable fallback, especially if visibility-edge geometry proves awkward. Godot's official `AStarGrid2D` exposes cells, solid points, diagonal rules, and A* paths. Its `jumping_enabled` is a search optimization, not character jumping. [Godot `AStarGrid2D`](https://docs.godotengine.org/en/stable/classes/class_astargrid2d.html) |
| Visibility/configuration-space graph + A* | Exact corner routing with few nodes in sparse polygonal scenes. | Best match for a small room of axis-aligned rectangles. Add support elevation and labelled traversal actions to the nodes and edges. [Lozano-Pérez and Wesley (1979)](https://research.ibm.com/publications/an-algorithm-for-planning-collision-free-paths-among-polyhedral-obstacles) |
| Navmesh | Arbitrary walkable geometry, large scenes, and established path-query tooling. | Technically sound but too much machinery for this engine and room. Recast separates mesh generation, path queries, dynamic tile caches, and crowd simulation into multiple systems. [Recast Navigation](https://github.com/recastnavigation/recastnavigation) |
| Flow / potential field | Amortizing global navigation across large crowds with shared goals. | Poor fit for one monster. The primary continuum-crowds work computes a dynamic potential field specifically to move large crowds together. [Treuille, Cooper, and Popović, *Continuum Crowds* (2006)](https://grail.cs.washington.edu/projects/crowd-flows/78-treuille.pdf) |

## Walk, jump, and drop links

Game navigation systems represent non-walking traversal as links between otherwise walkable regions. Godot's `NavigationLink2D` calls out jumps across gaps as a direct use case, while Unity's off-mesh-link documentation uses jumps over ditches and fences as examples. [Godot `NavigationLink2D`](https://docs.godotengine.org/en/stable/classes/class_navigationlink2d.html), [Unity Off-Mesh Link](https://docs.unity3d.com/2022.3/Documentation/Manual/class-OffMeshLink.html)

Apply that pattern here without adopting a full navmesh:

1. Treat floor, platform tops, and crate tops as support surfaces.
2. Generate takeoff and landing candidates at reachable edges of those surfaces.
3. Validate each candidate with the same body size, jump speed, gravity, time stepping, collision tests, and landing rules used by actor locomotion.
4. Store the validated transition as an action edge with its travel-time cost.
5. While executing it, steer to the takeoff point, issue one jump intent, preserve the planned horizontal intent through the arc, and confirm the expected landing.
6. If the arc is blocked or the landing changes, stop following that edge and replan rather than moving through geometry.

This also handles jumping over an obstruction: the link may land on the same support elevation after its validated arc clears the obstacle.

## Dynamic crates and replanning

Crates affect both horizontal clearance and available support surfaces. Rebuild or invalidate affected visibility and traversal links when a crate moves or changes elevation. For this room, rebuilding the small graph is simpler than introducing an incremental search algorithm.

Cache the current plan and replan when any of these occurs:

- the player changes support surface;
- a crate moves or changes support elevation;
- the next action is no longer valid;
- the goal leaves the chosen follow ring by a useful threshold; or
- a modest periodic fallback timer expires.

Do not recompute the whole route every render frame. Keep a direct line-of-travel check so the monster can skip obsolete waypoints when a segment becomes clear.

Moving obstacles should remain authoritative in collision even between replans. Unity's navigation documentation makes the same distinction: moving obstacles use local avoidance while stationary obstacles can alter the planned navmesh route. [Unity NavMesh Obstacle](https://docs.unity3d.com/2018.4/Documentation/Manual/class-NavMeshObstacle.html)

## Proposed seams

The smallest useful separation is:

```ts
planFollower(world, actor, goal): ReadonlyArray<NavigationAction>
intentForAction(world, actor, action): ActorIntent
moveActor(world, actor, intent, elapsed): World
```

`NavigationAction` should distinguish at least `Walk`, `Jump`, and `Drop`. `ActorIntent` should contain direction plus a jump-start signal. `moveActor` should own collision and vertical motion for both the player and lava monster, parameterized by body, collision height, speed, and jump capability.

Keeping planning declarative and locomotion shared removes the two failure modes that matter most here: a planner choosing physically impossible movement, and NPC-only movement bypassing player safeguards.
