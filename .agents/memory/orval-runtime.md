---
name: Orval runtime compatibility
description: Node runtime compatibility for regenerating the OpenAPI clients and Zod schemas.
---

The checked-in Replit configuration pins Node 24, but the shell runtime may resolve to Node 20. Orval 8.41 requires `Map.groupBy`, which is not available in that shell runtime.

**Why:** API code generation is part of the contract-first workflow; changing generator versions or generated output to work around a runtime mismatch is less reliable than using the project's pinned Node version.

**How to apply:** When Orval reports `Map.groupBy is not a function`, check `node --version` and run code generation with a compatible runtime before changing dependencies.
