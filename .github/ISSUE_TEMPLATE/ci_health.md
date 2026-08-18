---
title: Weekly health check failed
labels: ci-health
---

The weekly health check workflow found a failure. This checks broader
runtime coverage (Deno canary, Node current), a full dependency audit, and
consumer-facing doc drift beyond what the per-PR `ci.yml` checks.

Please review the failed run linked below and address the regression.
