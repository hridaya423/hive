# Token baseline

Measure how many input tokens the first request of a fresh Codex session uses.

## Needs

- Python 3 and `tiktoken` (`pip install tiktoken`, or `uv run --with tiktoken python3 ...`).
- A Hive build with Codex connected and an agent named `Probe` with default settings.

Hive keeps its data in `~/Library/Application Support/Hive`. Never read `~/Library/Application Support/OpenBot`.

## Steps

1. Start the Hive app. Send `hi` to a new `Probe` session.
2. Read the first request of each session from the Hive database. The database opens read-only.

   ```sh
   python3 -I tools/token-baseline/q.py "$HOME/Library/Application Support/Hive/openbot.db" \
     "select agent_id, session_id, min(occurred_at) as first_request_at,
        json_extract(tokens_json, '\$.uncachedInput') as uncached,
        json_extract(tokens_json, '\$.cachedInput') as cached
      from agent_usage_records group by session_id order by first_request_at"
   ```

3. Break one session down by component. Use its rollout file in `~/.codex/sessions/`.

   ```sh
   python3 -I tools/token-baseline/breakdown.py ~/.codex/sessions/<year>/<month>/<day>/rollout-<id>.jsonl
   ```

The number to track is `uncached` of a fresh session with no cache hit. Cache hits (`cached` above 0) lower it, so compare sessions that have none.
