# Observability Labelling & Correlation Contract

**Version** 0.1 (draft for review) · **Status** proposal · **Scope** all telemetry entering Grafana Cloud

This document defines the label keys, allowed values and injection rules that let telemetry from four structurally different application categories be queried, correlated and costed as one estate.

It is a contract, not a guideline: the Tier 1 keys are mandatory, and conformance is measured (see [section 12](#12-conformance-and-measurement)).

---

## 1. Why a contract rather than a style guide

A conventional labelling standard assumes someone can act on it in application code. For three of our four categories, nobody can. The contract therefore separates *what the labels must be* from *where they get applied*.

| Artifact | Contents | Owner | Location |
|---|---|---|---|
| **Contract** (this document) | Label keys, allowed values, mandatory sets, forbidden keys | Observability/Platform | `docs/labelling-contract.md` |
| **Registry** | Mapping of each telemetry source to its service, application, team, tier | Service owners, via PR | `registry/services.yaml` |

For category 1 the contract is satisfied at instrumentation time. For categories 2, 3 and 4 it is satisfied in the collection pipeline, from registry data. The same labels arrive in Grafana Cloud either way, which is what makes a single view possible.

**Single enforcement point.** Every path terminates in Grafana Alloy, so `prometheus.relabel` and `loki.relabel` are where the contract becomes real. Nothing reaches Grafana Cloud without traversing them.

### Expectation to set early

Grafana Cloud Application Observability only renders services that emit OpenTelemetry traces or span metrics, which in practice means category 1 only. The cross-domain view must therefore be a **custom service overview dashboard driven by the Tier 1 labels**, with drill-downs that differ per category. A single pane built on Application Observability alone would strand three quarters of the estate.

---

## 2. Decisions recorded

| # | Decision | Outcome | Consequence |
|---|---|---|---|
| 1 | Authority for `service_name` | **ServiceNow CMDB + MEGA Hopex** | Names are derived, never invented locally. Requires a normalisation rule (section 4) and a sync process. |
| 2 | Cost attribution labels | **`team` + `application`** | Safe only if `team` is functionally dependent on `application` (section 7). |
| 3 | Number of stacks | **Several; minimum production and development** | Attribution is configured per stack. No native cross-stack rollup. |
| 4 | Environment values | **OPEN** — starter enumeration proposed in section 5 | Needs confirmation before v1.0. |
| 5 | Per-tenant SaaS breakdown | **Not required** | Tenant identifiers are forbidden as labels. Simplifies category 2 considerably. |
| 6 | PII review for SaaS exports | **Cyber security owns review** | Sign-off gate per source, plus a `data_class` label (section 5). |

---

## 3. Identity model

Three nested levels of identity. Choosing the wrong grain for each is the most common cause of both broken correlation and cost-attribution failure.

| Level | Label | Grain | Source of truth | Typical count |
|---|---|---|---|---|
| Portfolio | `application` | Business application | **Hopex** Application object | tens to low hundreds |
| Deployable | `service_name` | One deployable/observable unit | **ServiceNow** CMDB CI | hundreds |
| Runtime | `instance` | One process, host or endpoint | Runtime or collector | thousands |

`application` groups many `service_name` values. This two-level split is what makes cost attribution by team and application viable while still allowing per-service troubleshooting.

> Always set `service_name` explicitly. When it is absent, Loki derives one from the first non-empty value among `service`, `app`, `application`, `app_name`, `name`, `container`, `job` and others, falling back to `unknown_service`. Since we use an `application` label, an unset `service_name` would silently inherit the application name.

---

## 4. Naming rules for `service_name`

CMDB CI names are not label-safe. Derive the label deterministically:

```text
1. lowercase the CMDB CI name
2. strip environment suffixes and parenthetical qualifiers
3. replace any run of characters outside [a-z0-9] with a single "-"
4. collapse repeated "-", then trim leading and trailing "-"
5. truncate to 63 characters

Result must match:  ^[a-z][a-z0-9-]{1,62}$
```

| CMDB CI name | `service_name` | Note |
|---|---|---|
| `Checkout API (PROD)` | `checkout-api` | Environment lives in `deployment_environment`, never the name |
| `SAP_S4HANA Core` | `sap-s4hana-core` | Underscores normalised |
| `Payments/Ledger Service` | `payments-ledger-service` | Slash removed, see warning below |
| `Salesforce CRM` | `salesforce-crm` | Category 2 sources are named the same way |

**Never use a slash in `service_name` or `service_namespace`.** Application Observability treats the slash as the namespace separator and its grouping and filtering features break.

### Collision policy

If two CIs normalise to the same value, append the Hopex application short code (`checkout-api-shop`, `checkout-api-ops`) and record both in the registry. Never auto-suffix a number; it is meaningless at query time.

### Identifiers that stay out of the labels

`cmdb_ci`, `hopex_id` and similar keys are **registry fields, not labels**. They carry no query value, they duplicate `service_name` cardinality, and they consume part of Loki's 15-label index budget. Surface them through dashboard links instead.

---

## 5. The label tiers

### Tier 1 — mandatory on every signal, from every category

| Key | Example | Purpose | Distinct values |
|---|---|---|---|
| `service_name` | `checkout-api` | Primary correlation key across all signals | hundreds |
| `service_namespace` | `shop` | Domain or bounded context | tens |
| `application` | `shop-checkout` | Hopex application; cost attribution | tens to low hundreds |
| `deployment_environment` | `production` | Environment filter; required for Application Observability baselines | 4 to 7 |
| `team` | `checkout` | Alert routing and cost attribution | tens |
| `tier` | `tier1` | Criticality; drives alert severity and cost conversations | 3 |
| `source_class` | `owned` | Which of the four categories this came from | 4 |

`source_class` is the least obvious and among the most useful. It lets us measure conformance per category, and lets a dashboard know which signals to expect before it renders an empty panel.

Allowed values:

```text
tier          tier1 | tier2 | tier3
source_class  owned | saas | hosted-cots | other
```

### Tier 2 — conditional, where meaningful

| Key | When | Note |
|---|---|---|
| `instance` | Any host, process or endpoint | Must be identical across metrics and logs for the same target |
| `service_version` | Category 1 | Answers "did the release cause this" |
| `cluster` | Kubernetes | Reserved by Kubernetes tooling; do not reuse for other groupings |
| `kafka_cluster` | Kafka | Deliberately distinct from `cluster` |
| `region` | Multi-region | AWS region |
| `provider` | Mixed hosting | `aws`, `saas`, `on-prem` |
| `data_class` | Recommended everywhere | `public`, `internal`, `confidential`, `restricted`. Supports Cyber review and may support label-based access control; confirm availability on our plan before relying on it for access. |
| `job` | Set by integrations | **Not ours to define** — see section 6 |

### Tier 3 — never a label

These belong in Loki structured metadata, span attributes or the log line. They are unbounded or short-lived, and as labels they would fragment streams and inflate series.

```text
trace_id   request_id   session_id   user_id   tenant_id
pod        container_id   query_id    order_id   ip_address
```

Per decision 5, tenant identifiers are not required for reporting. If a tenant value is ever needed for debugging, it goes to structured metadata.

### Forbidden as label keys

```text
Prohibited for cost attribution by Grafana Cloud:
  id  monetary  org_id  stack_id  instance  job  tenant
  mimir_namespace  loki_namespace  loki_cluster
  reason  tracker  retention_hours  anything starting __

Reserved by Synthetic Monitoring:      job  instance  probe
Reserved by Grafana Alerting:          alertname  grafana_folder
Managed by Database Observability:     server_id  op
```

Note that `job` and `instance` are prohibited *as attribution labels* while remaining essential operational labels. This is precisely why neither can serve as our identity key.

---

## 6. Why `job` cannot be the service key

Grafana Cloud integrations hard-code `job`, and their dashboards break if the value differs:

| Source | Required `job` value |
|---|---|
| Database Observability | `integrations/db-o11y` exactly |
| Kafka integration | `integrations/kafka` |
| Linux Server integration | `integrations/node_exporter` |
| Application Observability | derived: `service.namespace/service.name` |

`job` therefore means different things depending on origin, and is prohibited as an attribution label. **`service_name` is our identity key; `job` is source-specific metadata we preserve untouched.**

---

## 7. Cost attribution design

Grafana Cloud permits **2 attribution labels** with a combined maximum of **1,000 unique combinations**, enforced at configuration time, computed **per stack**, and **never backfilled**.

Chosen labels: **`team` + `application`**.

### The cardinality question, and why it is fine

The naive worst case is the product of both label cardinalities, which would be alarming:

```text
25 teams x 120 applications = 3,000 combinations   -> exceeds the 1,000 cap
```

But that product only materialises if the same application is owned by many teams. In practice each application has exactly one owning team, so `team` is *functionally dependent* on `application` and the number of real pairs collapses to roughly the number of applications:

```text
120 applications, each with one owning team = ~120 combinations   -> well inside the cap
```

**This gives us a hard design rule.**

> `team` is a property of `application`, resolved from the registry. A service never declares a team independently of its application.

The effective constraint becomes "keep `application` below roughly 1,000 distinct values", which the Hopex application layer comfortably satisfies. Shared applications owned by two teams add one combination each and are acceptable as documented exceptions.

### Measuring the real number

Because `service_info` (section 8) carries every Tier 1 label for every registered service, the actual combination count is cheap to query per stack:

```promql
count(
  count by (team, application) (service_info)
)
```

Track it, and alert at 80% of the cap (800) to leave room before configuration is refused.

### Enable it now

Cost attribution begins collecting only from the moment it is switched on, and historical data cannot be regenerated. Enable it on both stacks during Phase 1 even with imperfect labels; an incomplete report beats no report, and the gap cannot be recovered later.

---

## 8. Registry-generated `service_info` series

A small pattern that solves several problems at once. For every registry entry, emit one series per environment:

```text
service_info{service_name, service_namespace, application, team,
             tier, source_class, deployment_environment, data_class} 1
```

It gives us:

- **Dashboard variables** — populate service and application pickers from the registry, not from whatever happens to be reporting
- **Coverage detection** — a service present in `service_info` but with no telemetry for 24h is either broken or never onboarded
- **Attribution counting** — the query in section 7
- **A guaranteed join target** — one series carrying all Tier 1 labels exists for every service regardless of category

Cost is a few hundred series per stack, which is negligible.

---

## 9. Injection rules per category

### Category 1 — applications we control, on AWS

Set OpenTelemetry resource attributes at the source:

```text
OTEL_RESOURCE_ATTRIBUTES="service.name=checkout-api,\
service.namespace=shop,\
deployment.environment.name=production,\
service.version=1.4.2"
```

**Critical gotcha.** OTLP resource attributes do not automatically become labels on every metric series. They populate `target_info`, and only `job` and `instance` are promoted by default. Loki promotes a defined subset of resource attributes to labels, which includes `service.name`, `service.namespace` and `deployment.environment.name` but **not** `team`, `application`, `tier` or `source_class`.

Attribution labels must be present on the billed and queried series. Therefore:

- either configure resource-attribute promotion for `team`, `application`, `tier`, `source_class` on both the metrics and logs paths, and verify on real series
- or inject them in Alloy with `prometheus.relabel` and `loki.relabel` from the registry

The Alloy injection is the reliable path and is consistent with categories 2 to 4. Prefer it, and treat promotion as an optimisation to validate later.

### Category 2 — SaaS where we are administrator

No agent is possible. Ingest what the vendor exposes, and apply every Tier 1 label in the pipeline:

```alloy
loki.relabel "saas_salesforce" {
  forward_to = [loki.write.cloud.receiver]

  rule { target_label = "service_name"           replacement = "salesforce-crm" }
  rule { target_label = "service_namespace"      replacement = "crm" }
  rule { target_label = "application"            replacement = "crm-platform" }
  rule { target_label = "team"                   replacement = "sales-systems" }
  rule { target_label = "tier"                   replacement = "tier1" }
  rule { target_label = "source_class"           replacement = "saas" }
  rule { target_label = "deployment_environment" replacement = "production" }
  rule { target_label = "data_class"             replacement = "confidential" }
}
```

Availability and performance for this category are usually best measured with Synthetic Monitoring rather than vendor metrics. Add the same identity as custom check labels, respecting the 10-custom-label cap and the reserved `job`, `instance` and `probe` names.

Cyber sign-off is required before ingesting any SaaS audit-log export. Redact in the Alloy pipeline, before the write, not at query time.

### Category 3 — purchased applications on our EC2

We control the host and the collector, not the code. Use the vendor integration as published, then add identity:

```alloy
discovery.relabel "cots_billing" {
  targets = prometheus.exporter.unix.billing.targets

  // Leave the integration's own job value untouched.
  rule { target_label = "job"          replacement = "integrations/node_exporter" }
  rule { target_label = "instance"     replacement = constants.hostname }

  // Tier 1 identity from the registry.
  rule { target_label = "service_name" replacement = "acme-billing" }
  rule { target_label = "application"  replacement = "finance-billing" }
  rule { target_label = "team"         replacement = "finance-systems" }
  rule { target_label = "tier"         replacement = "tier1" }
  rule { target_label = "source_class" replacement = "hosted-cots" }
}
```

Rules specific to this category:

- Do not override `job`, `server_id` or `op`
- `instance` must carry an identical value on metrics and logs for the same target, and Database Observability additionally requires the `hostname:port` form
- Host metrics on a dedicated host are attributed to that host's `service_name`; on shared hosts use a platform service such as `shared-compute` with `source_class: other`

### Category 4 — everything else

The catch-all must never silently drop identity. Apply a default rule last:

```alloy
prometheus.relabel "default_identity" {
  forward_to = [prometheus.remote_write.cloud.receiver]

  rule { action = "replace"  target_label = "service_name" replacement = "unknown"
         source_labels = ["service_name"]  regex = "^$" }
  rule { action = "replace"  target_label = "team"         replacement = "unassigned"
         source_labels = ["team"]          regex = "^$" }
  rule { action = "replace"  target_label = "source_class" replacement = "other"
         source_labels = ["source_class"]  regex = "^$" }
}
```

Then alert on the volume of `service_name="unknown"`. An unknown bucket that is measured shrinks; one that is dropped never does.

---

## 10. Correlation strategy

| Hop | Join key | Mechanism |
|---|---|---|
| Metrics to traces | `service_name` + `deployment_environment` | Exemplars, span metrics |
| Logs to traces | `trace_id` | Loki structured metadata, never a label |
| Application to infrastructure | `instance`, or `k8s.*` attributes | Same `instance` value on metrics and logs |
| Frontend to backend | `service_name`, `service_namespace` | Faro app meta maps to `service.*` resource attributes |
| Synthetics to service | `service_name` as a custom check label | Filtering and alert routing |
| Profiles to service | `service_name` | Pyroscope tags must match `[a-zA-Z_][a-zA-Z0-9_]*`; no dots |
| Anything to cost | `team`, `application` | Cost Management and Billing |
| Anything to CMDB | `service_name` to `cmdb_ci` | Registry lookup, surfaced as a dashboard link |

The rule to remember: **one identity, many sources.** `service_name` must hold the identical value whether it originated in an SDK, a relabel rule or a registry lookup.

---

## 11. Multi-stack implications

With separate production and development stacks:

- Cost attribution is configured **per stack**; both need the same two labels registering, and there is no native cross-stack rollup
- `deployment_environment` is still required *within* each stack, because the development stack will hold more than one environment
- Stack selection becomes a routing decision in Alloy — the same pipeline, a different write endpoint
- Cardinality budgets, limits and dashboards are per stack; a clean development stack tells you nothing about production
- Consider a small meta-monitoring view that reads both stacks for conformance reporting

Proposed starter enumeration for decision 4, pending confirmation:

| `deployment_environment` | Stack |
|---|---|
| `production` | production |
| `dr` | production |
| `staging` | development |
| `test` | development |
| `development` | development |
| `sandbox` | development |

---

## 12. Conformance and measurement

Conformance is a number we track, not a campaign we run.

| Metric | Target | Source |
|---|---|---|
| Series and streams carrying all Tier 1 labels, by `source_class` | 95% | Conformance dashboard |
| Unattributed cost | under 5% | Cost Management |
| Registered services with no telemetry in 24h | 0 | `service_info` join |
| Telemetry with `service_name` absent from the registry | 0 | Inverse join |
| `team` x `application` combinations | under 800 | Section 7 query |

Alerts worth having from day one:

- Volume of `service_name="unknown"` rising
- Unattributed percentage above 5%
- Conformance for any `source_class` below 95%
- Attribution combinations above 800

Cardinality hygiene, monthly: review the cardinality management dashboards, act on the used/unused split, and run `logcli series '{}' --analyze-labels` against the busiest tenants.

---

## 13. Governance

### Onboarding gate

No source is connected until:

1. A registry entry exists, with `service_name` derived from the CMDB CI and `application` traced to Hopex
2. `application` has exactly one owning `team`
3. `tier` and `data_class` are set
4. `source_class` is declared
5. Cyber has signed off, for category 2 log exports
6. The Tier 1 labels are visible on real telemetry in the target stack

### Exceptions

Any departure from this contract is recorded as an ADR in `docs/adr/`, stating the constraint, the workaround, the blast radius and a review date. Undocumented exceptions are defects.

### Versioning and review

Semantic versioning. Renaming or removing a Tier 1 key is a major version and needs a migration plan, because it breaks dashboards, alert routing and attribution history simultaneously. Reviewed quarterly, and whenever a new product surface is onboarded.

---

## 14. Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `job` as the service identity | Claimed by integrations, prohibited for attribution | `service_name` |
| Environment inside the service name | Doubles the namespace, breaks grouping | `deployment_environment` |
| `pod`, `container_id`, `trace_id` as labels | Unbounded, fragments streams | Structured metadata |
| Adding a label "just in case" | Index growth and fragmentation for nothing | Add when a query needs it |
| `team` declared per service | Multiplies attribution combinations | Resolve `team` from `application` |
| Slash in `service_name` | Breaks Application Observability grouping | `service_namespace` |
| Renaming labels per product to look tidy | Breaks the mixins and dashboards that assume them | Preserve reserved names |
| Dropping unlabelled telemetry | The gap becomes invisible | Default to `unknown` and alert |
| CMDB identifiers as labels | Cardinality with no query value | Registry fields |

---

## 15. Open decisions

| # | Decision | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | Confirm the `deployment_environment` enumeration | v1.0 | Section 11 table |
| 2 | Confirm `application` count in Hopex is below 1,000 per stack | Before enabling attribution | Verify with section 7 query |
| 3 | CMDB-to-registry sync: manual PR, scheduled export, or API | Phase 3 | Manual PR, reviewed |
| 4 | `data_class` values and whether they drive access control | Phase 2 | Four values, reporting only |
| 5 | Owner of the registry repository and its review rota | Phase 1 | Platform team |
| 6 | Whether host metrics on shared hosts roll up to a platform service | Phase 2 | `shared-compute`, `source_class: other` |

---

## 16. Reference: platform limits

Constraints that shaped this contract. Verify against current documentation before relying on any single figure.

| Constraint | Limit |
|---|---|
| Loki index labels per stream | 15 |
| Loki structured metadata per line | 64 KB, 128 entries |
| Loki active streams per tenant, guidance | under 100,000 |
| Cost attribution labels | 2 |
| Cost attribution combinations | 1,000 per stack |
| Synthetic Monitoring custom labels | 10 per check, 3 per private probe |
| k6 label keys | 100 per org, 30 per project, key under 64 characters |
| OpenTelemetry attributes per span, default | 128 |
| Pyroscope tag format | `[a-zA-Z_][a-zA-Z0-9_]*`, no dots |
| Grafana IRM labels, guidance | 4 to 5 per alert |

Source documentation for every constraint above is catalogued in the [label management digest](../index.html) that accompanies this repository.
