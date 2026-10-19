# Tracker logic checks

Run `node tests/tracker.test.cjs` from this repository. No npm dependencies are needed.

The runner extracts the actual `ExtractCardData`, `RandomRemaining`, and `FilterLocations` bodies from the WitcherScript source, erases type declarations, and mocks the game APIs. Struct values are copied when pushed into arrays. Empty string-array indexing follows WitcherScript defaults.

Coverage includes alternate opponent facts, exhausted random rewards, mixed fact/card rows, disabled item definitions, mod-restored items, unique card ownership, the four three-copy cards, and both Geralt/Ciri variants. This is control-flow testing; it does not compile WitcherScript or validate NPC tags in running quest scenes.

An optional private game-data fixture expands coverage to every configured location:

`node tests/tracker.test.cjs scripts/local/missingCardTracker.ws --fixture /path/to/fixture.json`

Fixture shape:

```json
{
  "locations": [{"entryIdx":"example", "query":[], "cards":["card_item"]}],
  "sourceRows": [{"CardName":"card_item", "OriginArea":"NML"}],
  "activeCards": ["card_item"]
}
```

Use location rows from `mod_missing_card_tracker.csv`, source rows from the installed game's `card_sources.csv`, and active items tagged `GwintCard` from the installed item definitions. Do not count XML comments as active definitions. The local fixture is not included because it derives from installed game data.
