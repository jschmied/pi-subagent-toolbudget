# pi-subagent-toolbudget

> Tool-call budget for pi-subagents: soft nudge + hard stop so runaway sub-agents finalize instead of overflowing context. No-op outside sub-agents.

A companion [Pi](https://pi.dev) extension for **[pi-subagents](https://pi.dev/packages/pi-subagents)** that caps how many tool calls a spawned **sub-agent** may make — a soft "wrap up" nudge, then a hard stop — so a runaway agent produces a final report instead of overflowing its context window and dying.

It is a **no-op** in the top-level agent and in any non-subagent Pi session. It only activates inside a sub-agent process.

## Why

Sub-agents (e.g. code reviewers) occasionally "browse the tree": dozens to hundreds of `read`/`grep` calls until they overflow their context and exit non-zero having produced nothing. Across one real review batch, healthy reviewers sat around **~25 tool calls** (p90 ≈ 49), while the tail ran **50–440 calls** and failed silently.

A hard cap turns that silent failure into a usable outcome: at the limit the agent is told to **stop and write its final report from what it already gathered**. Combined with a launcher that retries genuinely-truncated runs on a smaller input, you get: *ask* (prompt) → *enforce* (this extension) → *recover* (retry).

## How it works

pi-subagents runs each sub-agent in its own process and sets `PI_SUBAGENT_CHILD=1` (plus `PI_SUBAGENT_CHILD_AGENT`, `PI_SUBAGENT_DEPTH`, …) in that child's environment. This extension:

1. On load, returns immediately unless `PI_SUBAGENT_CHILD === "1"` — so it governs sub-agents only.
2. Counts tool calls via the `tool_call` hook.
3. Past **`soft`**, annotates each tool result with a "start writing your final report" nudge.
4. At **`hard`**, **blocks** further **read/search** calls only — `read`, `grep`, `find`, `ls` (`{ block: true }`) — forcing the model to finalize. Report/output/messaging tools (and a plain-text final answer) are **never** blocked, so the agent can always deliver its report when told to stop.

Because each sub-agent is a separate process, the counter is naturally per-sub-agent — no shared state.

## Configuration

The budget comes from the **launch wiring**, not the environment. Put a directive anywhere in the sub-agent's task text:

```
[[toolbudget: soft=40 hard=60]]
```

- `soft` — start nudging after this many tool calls.
- `hard` — block all tool calls beyond this many.
- Either key may be omitted; a missing directive uses the built-in defaults **`soft=35`, `hard=60`**.

There are **no environment variables** for the budget. `PI_SUBAGENT_CHILD` is read only to detect a sub-agent (pi-subagents sets it); it is not a configuration knob.

### Example: wiring it from a launcher

When a launcher builds each sub-agent task, append the directive to the task prompt:

```ts
subagent({ tasks: [
  { agent: "hibernate-reviewer",  task: `${prompt}\n\n[[toolbudget: soft=40 hard=60]]` },
  { agent: "spring-boot-reviewer", task: `${prompt}\n\n[[toolbudget: soft=40 hard=80]]` }, // bigger diff → more room
], concurrency: 8 });
```

## Install

Install **globally** — sub-agents inherit globally-installed extensions, but **not** those passed with `-e` (verified). Either:

**As a package** in `~/.pi/agent/settings.json`:

```json
{ "packages": ["npm:pi-subagent-toolbudget"] }
```

**Or drop the file** at `~/.pi/agent/extensions/` (single-file form) for local use.

> Project-local `.pi/extensions/` propagation to sub-agents is untested; prefer a global install.

## Verify

Set a tiny budget and have a sub-agent attempt more calls than allowed:

```
[[toolbudget: soft=1 hard=2]]   # task text: "Call the ls tool four times, then reply DONE."
```

The first two calls run; the rest are blocked and the agent finalizes. In the top-level agent the extension logs/does nothing.

## Limitations

- **Global install required** (see above).
- Pi's recorded `toolCount` counts *attempts*, so a blocked-and-retried call still increments it; what matters is that no read/search tool beyond `hard` actually **executes**.
- The cap is structural, not semantic — set `hard` generously (default 60, past the p90 of ~49) so healthy runs are never truncated and only true runaways hit the wall.
- **Only read/search tools are capped** (`read`, `grep`, `find`, `ls`). `bash`, edits, and report/output/messaging tools are intentionally left open so the final report is never blocked — the trade-off is that a runaway that browses via `bash` (e.g. repeated `cat`/`grep`) is not caught.

## Publishing

`npm publish` (the package metadata and `files` allowlist are ready).

## License

MIT © Jürgen Schmied
