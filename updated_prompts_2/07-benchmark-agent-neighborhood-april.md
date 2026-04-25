# Agent 7: Benchmark Agent - Neighborhood Cache Mode (April)

## Update Objective
Keep existing benchmark generation capability, but treat neighborhood comps as cache-mode source-of-truth when provided by CRO Router.

## Data Source Modes

### Mode A - Neighborhood Cache Mode (highest priority)
Condition: CRO Router passes `nearby_comps` with valid `percentiles`.

Use:
- `nearby_comps.percentiles.p25/p50/p75/p90` for distribution
- `nearby_comps.comps[]` for examples
- `nearby_comps.summary` for sample quality context

Do not run internet search in this mode.

### Mode B - Existing Cache Mode
Condition: `data_source.cache_available == true` and no `nearby_comps` payload.

Use existing Airbtics cache-mode behavior.

### Mode C - Internet Fallback
Condition: no neighborhood payload and no cache.

Use existing internet-search benchmark workflow.

## Notes
- Keep output schema unchanged.
- Set internal reasoning source label to `nearby_comps_cache` when Mode A is used.
