# Backend ask (for Manoj): expose the territory rule constants

**Why:** the client previews whether a loop will count (closed / area / too small) before the
server decides. Those numbers were copied by hand; if `application.properties` changes they
silently drift. The client already loads them from the server when available and falls back to
built-in values (`src/game/territoryRules.js`, `initTerritoryRules`).

**Ask:** a public, cacheable `GET /v1/territory/rules` (or the same object as an extra field on an
existing config/status response - the client only needs the object). Response:

```json
{
  "closureThresholdMeters": 25.0,
  "minEnclosedAreaSqMeters": 2000.0,
  "simplifyToleranceMeters": 3.0,
  "minPoints": 10,
  "maxAcceptableAccuracyMeters": 20.0,
  "maxSegmentSpeedMetersPerSecond": 20.0,
  "maxSustainedSpeedMetersPerSecond": 12.0,
  "maxSustainedSpeedViolationRatio": 0.3,
  "maxConsecutiveViolationSeconds": 5.0
}
```

| field                       | source today                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| closureThresholdMeters      | `territory.loop.closure-threshold-meters` (TerritoryLoopProperties)                                                   |
| minEnclosedAreaSqMeters     | `territory.loop.min-enclosed-area-sq-meters`                                                                          |
| simplifyToleranceMeters     | `territory.loop.simplify-tolerance-meters`                                                                            |
| minPoints                   | `territory.loop.min-points`                                                                                           |
| maxAcceptableAccuracyMeters | **hardcoded** `RunServiceImpl.MAX_ACCEPTABLE_ACCURACY_METERS = 20.0` - please move to a property so it can be exposed |
| max*Speed*, ratio, seconds  | `territory.anticheat.*` (TerritoryAntiCheatProperties)                                                                |

Read them from the same `@ConfigurationProperties` beans the loop builder / validator use, so the
endpoint can never disagree with the code. Unknown or missing fields are ignored by the client.

**Drift tests:** `src/game/territoryFixtures.json` (12 sample tracks with expected
outcome / area / perimeter / closure gap - **recorded from the client's JS port, not yet from the server**:
no JDK was available when this was written, so `TerritoryRuleFixturesTest` has never been run) is run by the client (`territoryRules.test.js`). The same
file is in the backend repo on branch `test/territory-rule-fixtures`
(`TerritoryRuleFixturesTest`, resource `territory-loop-fixtures.json`) - please merge it, and when a
rule changes on purpose re-record with
`./mvnw test -Dtest=TerritoryRuleFixturesTest -Dfixtures.dump=/tmp/actual.json` and copy the
`expected` blocks into BOTH fixture files.

**First thing to do with the backend branch:** run `TerritoryRuleFixturesTest`. If any case differs, the
server is right: re-record the `expected` blocks from the server output and the client port
(`simplifyLine` / the polygon-clipping repair in `territoryRules.js`) must be fixed to match. The most
likely differences are self-crossing tracks (figure-eight: JTS `buffer(0)` vs `polygon-clipping`) and
tracks where JTS's TopologyPreservingSimplifier keeps a vertex plain Douglas-Peucker drops.
