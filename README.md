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
| 35 cards | Per document: source link, the conclusion it establishes, a worked example, and 3–7 concrete actions with the real label names, limits and config snippets inline. |
| Filter bar | Full-text search plus filters for hard requirements (9), read-first (12), Logs (13), Metrics, Traces (7), Profiles (1), Cost (11) and product setup (15). |

Coverage breaks down as 20 best-practice documents (Part 1) and 15 product-specific label requirements (Part 2).

## Why "hard requirements" matter

Nine of the documents describe labels that are **contractual** rather than advisory — get the value wrong and the shipped dashboards render empty. The most exacting examples:

- **Database Observability** — `job` must be exactly `integrations/db-o11y`, and `instance` must be `hostname:port`, set identically in both `loki.relabel` and `discovery.relabel`.
- **Application Observability** — `job` is derived from `service.namespace/service.name`; `deployment_environment` is required for baselines to work.
- **Kafka integration** — every node in a cluster must share one `kafka_cluster` value, while each carries a unique `instance`.
- **Kubernetes Monitoring** — pod logs must reach Loki carrying `cluster`, `namespace` and `pod`.

These are filterable via the red-dot "Hard requirements" chip on the page.

## Link corrections

Two links in the source PDF are stale and have been corrected here:

| Document | Corrected URL |
|---|---|
| Labels and annotations (Alerting) | `grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rules/annotation-label/` |
| Loki Label Strategies (Grafana Learn) | `learn.grafana.com/path/best-practice-guides/loki-label-strategies` |

All 35 links were checked; 34 return HTTP 200 and the Grafana Learn URL is reachable in a browser but returns 403 to automated requests.

## The labelling contract

Alongside the digest, this repository holds our own cross-domain labelling and correlation contract, covering the four application categories in our estate: applications we control on AWS, SaaS we administer, purchased software we host on EC2, and everything else.

| Format | File | Use |
|---|---|---|
| Markdown | [`docs/labelling-contract.md`](docs/labelling-contract.md) | Source of truth, reviewable in pull requests |
| HTML | [`contract.html`](contract.html) | Reading in a browser, with contents sidebar, review highlighting and print styles |

The contract is currently **v0.2, a draft for review**. Every change from v0.1 is marked in place, and section 20 lists them all. In the HTML, yellow marks a change and red marks an open decision.

The HTML is generated. After editing the Markdown:

```sh
node tools/build-contract.js           # regenerate contract.html
node tools/build-contract.js --check   # exit 1 if contract.html is stale
```

No dependencies and no install step. The generator supports only the Markdown subset the contract uses. It fails the build on the constructs it knows it cannot render (indented lines, h5+ headings, images, raw HTML, tables with mismatched cells, unclosed bold), but it is not a full Markdown validator. The date shown in the HTML comes from the **Updated** field in the Markdown, so rebuilding unchanged Markdown produces identical output.

### The three load-bearing decisions

- **`service_name` is the identity key, not `job`.** Grafana Cloud integrations hard-code `job` (`integrations/db-o11y`, `integrations/kafka`) and it is prohibited as a cost-attribution label, so it cannot identify a service across domains.
- **`team` is resolved from `application`, never declared per service.** This pins cost-attribution combinations to roughly the number of applications instead of the product of teams and applications, keeping us inside the 1,000-combination cap.
- **Labels are applied in the pipeline, not only in code.** Three of the four categories have no code we control, so Alloy relabel rules driven by a registry are the enforcement point.

## Attribution

Every source document is published by Grafana Labs on [grafana.com](https://grafana.com/docs/) and each card links directly to its source. Summaries are paraphrased and condensed — consult the source before implementing, since limits and defaults change between releases. Content was rephrased for compliance with licensing restrictions.
