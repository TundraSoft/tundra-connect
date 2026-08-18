---
title: Monthly live-vendor test failed
labels: live-test-failure
---

The monthly live-vendor test workflow found a failure. This runs each
connect's `— live` test suite against the real vendor for whichever
connectors have credentials configured as repo secrets (see `.env.sample`)
— unlike `ci-health`, a failure here often means the vendor's API drifted
or its sandbox is flaky, not necessarily a regression in this repo's code.

Please review the failed run linked below before assuming a code fix is
needed — check whether the vendor's API/sandbox is itself degraded first.
