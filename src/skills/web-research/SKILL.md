---
name: web-research
description: Improve time-sensitive web research. Use when the user asks for latest news, current events, weather, or uses relative time words such as today, tomorrow, recent, latest, or ongoing.
---

When handling a time-sensitive web query, do not jump straight to `web_search`. Use this workflow:

1. Decide whether the request is freshness-sensitive.
   Freshness-sensitive examples include:
   - latest news, recent updates, current situation, ongoing developments
   - today, tomorrow, yesterday, this week
   - weather, travel conditions, market-moving events
2. If the request is not freshness-sensitive, use normal reasoning and tools as needed. This skill is mainly for time-sensitive web research.
3. If the request is freshness-sensitive, first get the current Beijing time via `bash` before interpreting relative time:

```bash
TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S %Z %z'
```

4. Treat the result above as the authoritative current time for this skill. Do not guess what "today", "tomorrow", "latest", or "recent" means without fetching time first.
5. Convert relative time words into an explicit date or freshness window:
   - "today" => the current calendar date in Beijing time
   - "tomorrow" => the next calendar date in Beijing time
   - "latest" / "recent" / "ongoing" => a freshness-oriented window, usually the past 24-72 hours unless the query clearly implies a broader window
6. Rewrite the search query before calling `web_search`.
   Good rewrites:
   - include the target entity and topic clearly
   - include the explicit date when the user asked about today or tomorrow
   - include freshness terms when the user asked for the latest developments
   - prefer concise search text over long natural-language questions
7. Call `web_search` with the rewritten query.
8. Inspect the returned sources and summary for freshness. If the results appear stale, ambiguous, or off-topic, do one follow-up search with a narrower or clearer rewrite.
9. In the final answer, explicitly state the time basis you used. Examples:
   - "I interpreted 'tomorrow' using Beijing time, which is 2026-03-20."
   - "I treated 'latest' as the most recent developments available at the time of search, using current Beijing time as the reference."
10. If time retrieval fails, say so explicitly and avoid pretending that the relative time was resolved correctly.

Additional guidance:

- Keep `web_search` as the execution tool; this skill is the research strategy layer.
- Prefer authoritative or obviously current sources when summarizing time-sensitive results.
- If the user asks for weather in a city for a relative date, include the explicit date in the search query.
- If the user asks for fast-moving conflict or political news, prefer framing the answer around developments and source recency rather than a single definitive statement.
