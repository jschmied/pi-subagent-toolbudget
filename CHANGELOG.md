# Changelog

## 0.1.0

Initial release.

- Activates only inside a sub-agent (`PI_SUBAGENT_CHILD=1`); no-op elsewhere.
- Per-task budget via a `[[toolbudget: soft=… hard=…]]` directive in the task text; no
  environment configuration.
- Soft nudge appended to tool results past `soft`; past `hard`, blocks only the read/search
  tools (`read`, `grep`, `find`, `ls`) so report/output/messaging tools stay available and the
  final report is never blocked.
- Built-in defaults `soft=35`, `hard=60`.
