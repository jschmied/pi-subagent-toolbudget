# Changelog

## 0.1.0

Initial release.

- Activates only inside a sub-agent (`PI_SUBAGENT_CHILD=1`); no-op elsewhere.
- Per-task budget via a `[[toolbudget: soft=… hard=…]]` directive in the task text; no
  environment configuration.
- Soft nudge appended to tool results past `soft`; hard `tool_call` block past `hard`.
- Built-in defaults `soft=35`, `hard=60`.
