---
max_turns: 20
---

/cairn Full tier. I'm going with Postgres over SQLite for the new service, 80% confident the criterion "p95 latency under 50 ms in staging" is met by 2026-12-15. Domain: work. If-then: if it is not met by then, we revert to SQLite. Reasoning: the team already runs Postgres and the write volume is small. Run the adversary, then commit as is without asking me anything.
