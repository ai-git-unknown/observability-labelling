# Observability Labelling

A reading digest of Grafana Cloud's label management documentation: **35 source documents reduced to one conclusion and a short list of actions each.**

Built from the internal *Grafana Cloud — Label Management Documentation Reference* (8 July 2026), which catalogues label-management best practices for Metrics, Logs, Traces and Profiles, plus the required and recommended labels for each Grafana Cloud product.

## Viewing it

Open [`index.html`](index.html) in any browser. It is a single self-contained file — no build step, no dependencies, no network access required.

```sh
# macOS
open index.html
# Linux
xdg-open index.html
```

## What's in it

| Section | Purpose |
|---|---|
| The 7 rules | The principles every one of the 35 documents restates. Read this if you read nothing else. |
| Reading tracks | Four ordered paths with time estimates: fastest useful path (~35 min), rising costs (~45 min), empty dashboards (~30 min), designing a standard (~90 min). |
| 35 cards | Per document: source link, the conclusion it establishes, and 3–7 concrete actions with the real label names, limits and config snippets inline. |
| Filter bar | Full-text search plus filters for hard requirements (9), read-first (12), Logs (13), Metrics, Traces (7), Profiles (1), Cost (11) and product setup (15). |

Coverage breaks down as 20 best-practice documents (Part 1) and 15 product-specific label requirements (Part 2).

## Why "hard requirements" matter

Nine of the documents describe labels that are **contractual** rather than advisory — get the value wrong and the shipped dashboards render empty. The most exacting examples:

- **Database Observability** — `job` must be exactly `integrations/db-o11y`, and `instance` must be `hostname:port`, set identically in both `loki.relabel` and `discovery.relabel`.
- **Application Observability** — `job` is derived from `service.namespace/service.name`; `deployment_environment` is required for baselines to work.
- **Kafka integration** — every node in a cluster must share one `kafka_cluster` value, while each carries a unique `instance`.
- **Kubernetes Monitoring** — pod logs must reach Loki carrying `cluster`, `namespace` and `pod`.

These are filterable via the ⚠ chip on the page.

## Link corrections

Two links in the source PDF are stale and have been corrected here:

| Document | Corrected URL |
|---|---|
| Labels and annotations (Alerting) | `grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rules/annotation-label/` |
| Loki Label Strategies (Grafana Learn) | `learn.grafana.com/path/best-practice-guides/loki-label-strategies` |

All 35 links were checked; 34 return HTTP 200 and the Grafana Learn URL is reachable in a browser but returns 403 to automated requests.

## Attribution

Every source document is published by Grafana Labs on [grafana.com](https://grafana.com/docs/) and each card links directly to its source. Summaries are paraphrased and condensed — consult the source before implementing, since limits and defaults change between releases. Content was rephrased for compliance with licensing restrictions.
