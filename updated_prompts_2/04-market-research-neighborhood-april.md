# Agent 4: Market Research - Neighborhood Patch (April)

## Update Objective
Preserve event/news analysis and switch competitor citation logic to neighborhood comps provided by CRO Router.

## New Input Contract
In addition to existing inputs:
- `nearby_comps.comps[]` with fields like `listing_name`, `distance_km`, `native_rate_avg`, `occupancy`
- `nearby_comps.percentiles` with `p25/p50/p75/p90`

## Priority Rule
1. Use neighborhood percentiles first for competitor positioning.
2. Use `benchmark` only as fallback when neighborhood payload is absent.

## Citation Rules (New)
- Cite real competitors from `nearby_comps.comps[]`.
- Prefer entries with non-null `native_rate_avg`.
- Include `distance_km` in narrative comparisons where helpful.
- Never invent comp names or prices.

## Output Behavior (Delta)
- Keep schema unchanged.
- Populate `competitors.examples` using nearby comps first.
- In summary, include whether insight is neighborhood-based or fallback benchmark-based.
