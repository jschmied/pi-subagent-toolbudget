# Changelog

## 0.1.1

- Add gallery preview image (`pi.image`) for pi.dev/packages.

## 0.1.0

Initial release.

- Activates only inside a sub-agent (`PI_SUBAGENT_CHILD=1`); no-op elsewhere.
- Per-task budget via a `[[toolbudget: soft=… hard=…]]` directive in the task text; no
  environment configuration.
- Soft nudge appended to tool results past `soft`; past `hard`, blocks only the configured
  tools — default `read,grep,find,ls` — so report/output/messaging tools stay available and the
  final report is never blocked. Override per task with `block=...` (or `block=*` for all tools).
- Built-in defaults `soft=35`, `hard=60`, `block=read,grep,find,ls`.
