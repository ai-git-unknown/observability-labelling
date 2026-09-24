# Observability Labelling & Correlation Contract

**Version** 0.2 (draft for review) · **Status** proposal · **Updated** 2026-09-24 · **Scope** metrics, logs and traces entering Grafana Cloud

This document defines the label keys, allowed values and injection rules that let telemetry from four structurally different application categories be queried, correlated and costed as one estate.

It is a contract, not a guideline: the Tier 1 keys are mandatory, and conformance is measured (see [section 15](#15-conformance-and-measurement)).

> **Added in v0.2 — how to review this version.** v0.2 applies the review of v0.1. Every change is marked so it can be checked before it is accepted. Callouts like this one mark new or rewritten passages. A `**[v0.2]**` tag marks a changed row or list item. A `**[review]**` tag marks a point that is still open for the owner's decision and must not be treated as settled. [Section 20](#20-changes-in-v02) lists every change in one place.

---

## 1. Why a contract rather than a style guide

A conventional labelling standard assumes someone can act on it in application code. For three of our four categories, nobody can. The contract therefore separates *what the labels must be* from *where they get applied*.

| Artifact | Contents | Owner | Location |
|---|---|---|---|
| **Contract** (this document) | Label keys, allowed values, mandatory sets, restricted keys | Observability/Platform | `docs/labelling-contract.md` |
| **Registry** | Mapping of each telemetry source to its service, application, team, tier | Platform team, maintained by hand **[v0.2]** | Platform team inventory; format to be agreed **[v0.2]** |

For category 1 the contract is satisfied at instrumentation time. For categories 2, 3 and 4 it is satisfied in the collection pipeline, from registry data. The same labels arrive in Grafana Cloud either way, which is what makes a single view possible.

**Primary enforcement point.** **[v0.2]** Most paths terminate in Grafana Alloy, so the Alloy relabel and processing components are where the contract becomes real for those paths. Section 10 shows where each label is set, changed or dropped, and section 11 lists what Alloy can and cannot do.

> **Changed in v0.2 — for review.** v0.1 said nothing reaches Grafana Cloud without passing through Alloy. That is not true. These paths bypass our Alloy entirely: Synthetic Monitoring checks (they run on Grafana probes), k6 test runs, Faro frontend telemetry (sent straight to the Grafana collector endpoint), and any Grafana-hosted integration or cloud-provider connection that Grafana collects directly. Each of these must be labelled in its own product configuration, using the same values from the registry.

> **Added in v0.2 — for review.** The registry is, for now, a **manual data inventory maintained by the Platform team**. There is no generator: pipeline rules are written by hand from the inventory. This is workable at current scale, but the rules and the inventory will drift apart unless they are reconciled regularly (section 16).

### Expectation to set early

Grafana Cloud Application Observability only renders services that emit OpenTelemetry traces or span metrics, which in practice means category 1 only. The cross-domain view must therefore be a **custom service overview dashboard driven by the Tier 1 labels**, with drill-downs that differ per category. A single pane built on Application Observability alone would leave three of our four categories out. **[v0.2]**

> **Added in v0.2 — for review.** eBPF auto-instrumentation (Grafana Beyla, now contributed to OpenTelemetry as eBPF instrumentation) can produce traces and span metrics for HTTP and gRPC services without code changes. It could bring some category 3 applications into Application Observability. It has not been evaluated for our estate.

---

## 2. Decisions recorded

| # | Decision | Outcome | Consequence |
|---|---|---|---|
| 1 | Authority for `service_name` | **ServiceNow CMDB + MEGA Hopex** | Names are derived, never invented locally. Requires a normalisation rule (section 4) and a sync process. |
| 2 | Cost attribution labels | **`team` + `application`** | Safe only if `team` is functionally dependent on `application` (section 7). |
| 3 | Number of stacks | **Several; minimum production and development** | Attribution is configured per stack. No native cross-stack rollup. |
| 4 | Environment values | **OPEN** — starter enumeration proposed in section 14 | Needs confirmation before v1.0. |
| 5 | Per-tenant SaaS breakdown | **Not required** | Tenant identifiers are forbidden as labels. Simplifies category 2 considerably. |
| 6 | PII review for SaaS exports | **Cyber security owns review** | Sign-off gate per source. The accompanying `data_class` label is undecided. **[review]** |
| 7 | Traces | **In scope** **[v0.2]** | Tier 1 applies to traces as resource attributes (section 9). |
| 8 | Profiles | **Not yet in scope** **[v0.2]** | Pyroscope rules are kept for reference only. Revisit before onboarding any profiles. |
| 9 | Registry | **Manual inventory, Platform team** **[v0.2]** | No generator. Relabel rules are written by hand from the inventory. |
| 10 | Kubernetes | **Not targeted** **[v0.2]** | `cluster`, `namespace` and `pod` are optional. They become required on logs if Kubernetes Monitoring is ever adopted. |

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
2. remove parenthetical qualifiers, for example "(prod)"
3. remove one trailing environment word from this fixed list:
     prod production dr stg staging uat test dev development sandbox
4. replace any run of characters outside [a-z0-9] with a single "-"
5. trim leading and trailing "-"
6. if the result starts with a digit, prefix "svc-"
7. truncate to 63 characters, then trim any trailing "-" again

Result must match:  ^[a-z][a-z0-9-]{1,62}$
```

> **Changed in v0.2 — for review.** Three defects in the v0.1 algorithm are fixed. "Strip environment suffixes" was a judgement call, so step 3 now uses a fixed word list. A name starting with a digit failed the result pattern, so step 6 adds a prefix; the `svc-` prefix is a proposal. Truncating after trimming could leave a trailing "-", so step 7 trims again. Non-ASCII characters are replaced by step 4, not transliterated (for example, "Café" becomes `caf`), so check the results for collisions.

| CMDB CI name | `service_name` | Note |
|---|---|---|
| `Checkout API (PROD)` | `checkout-api` | Environment lives in `deployment_environment`, never the name |
| `SAP_S4HANA Core` | `sap-s4hana-core` | Underscores normalised |
| `Payments/Ledger Service` | `payments-ledger-service` | Slash removed, see warning below |
| `Salesforce CRM` | `salesforce-crm` | Category 2 sources are named the same way |
| `3M Portal` | `svc-3m-portal` | Leading digit prefixed **[v0.2]** |

**Never use a slash in `service_name` or `service_namespace`.** Application Observability treats the slash as the namespace separator and its grouping and filtering features break.

### Stability rule

> **Added in v0.2 — for review.** A `service_name` is fixed when its registry entry is created. Later changes to the CMDB CI name or the Hopex short code do **not** change it; the inventory records the name it was derived from. Changing a `service_name` is a deliberate migration (section 16), because it breaks dashboards, alert routing and cost history at the same time.

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

"Every signal" means every metric series, every log stream and every trace. Traces carry these keys as resource attributes, not labels; section 9 gives the attribute names. **[v0.2]**

`source_class` is the least obvious and among the most useful. It lets us measure conformance per category, and lets a dashboard know which signals to expect before it renders an empty panel.

Allowed values:

```text
tier          tier1 | tier2 | tier3
source_class  owned | saas | hosted-cots | other

Sentinels, set only by the default rule (section 12, category 4):
service_name  unknown_service
team          unassigned
source_class  unknown
```

> **Added in v0.2 — for review.** The sentinel values are new. In v0.1 the default rule set a missing `source_class` to `other`, which is also a legitimate value, so defaulted telemetry was indistinguishable from genuine category 4 and the conformance figure hid the defect it was meant to measure. The `service_name` default changes from `unknown` to `unknown_service`, the value Loki already uses, so one sentinel covers both our rule and Loki's fallback.

### Tier 2 — conditional, where meaningful

| Key | When | Note |
|---|---|---|
| `instance` | Any host, process or endpoint | Must be identical across metrics and logs for the same target |
| `service_version` | Category 1 | Answers "did the release cause this" |
| `region` | Multi-region | AWS region |
| `provider` | Mixed hosting | `aws`, `saas`, `on-prem` |
| `kafka_cluster` | Kafka | Deliberately distinct from `cluster` |
| `data_class` | **Status undecided** **[review]** | Proposed values `public`, `internal`, `confidential`, `restricted`. Would support Cyber review and possibly label-based access control; confirm availability on our plan before relying on it for access. |
| `cluster`, `namespace`, `pod` | Kubernetes only — **optional** **[v0.2]** | Kubernetes is not targeted in our estate. If Kubernetes Monitoring is ever adopted, all three become **required on pod logs**, because its logs-to-workload navigation depends on them. `cluster` is reserved by Kubernetes tooling; do not reuse it for other groupings. |
| `job` | Set by integrations | **Not ours to define** — see section 6 |

> **Added in v0.2 — for review: `data_class`.** v0.1 was inconsistent: this table called `data_class` recommended, while the onboarding gate and `service_info` treated it as mandatory. Its status is now explicitly open. Decide one of: (a) mandatory — move it to Tier 1 and keep the onboarding gate; (b) recommended — keep it here and drop it from the gate; (c) dropped — Cyber's review is recorded in the inventory only. Until decided, set it where known and do not block onboarding on it. It also costs one label slot, which matters on sources near the Loki limit (see the label budget below).

> **Changed in v0.2 — for review: `pod`.** v0.1 listed `pod` in Tier 3 as never a label. That contradicted Kubernetes Monitoring, which requires it on pod logs. Since we do not target Kubernetes, it is now optional.

`provider` overlaps with `source_class` (`saas` appears in both), and none of our four categories is on-premises. Consider dropping it. **[review]**

### Tier 3 — never a label

These belong in Loki structured metadata, span attributes or the log line. They are unbounded or short-lived, and as labels they would fragment streams and inflate series.

```text
trace_id   request_id   session_id   user_id   tenant_id
container_id   query_id    order_id   ip_address
```

Per decision 5, tenant identifiers are not required for reporting. If a tenant value is ever needed for debugging, it goes to structured metadata.

### Restricted keys

> **Changed in v0.2 — for review.** v0.1 titled this "Forbidden as label keys", but `job` and `instance` are listed here and are also Tier 2 labels. These keys are restricted in specific ways, not forbidden outright.

```text
Prohibited as cost-attribution labels by Grafana Cloud:
  id  monetary  org_id  stack_id  instance  job  tenant
  mimir_namespace  loki_namespace  loki_cluster
  reason  tracker  retention_hours  anything starting __

Reserved by Synthetic Monitoring:      job  instance  probe
Reserved by Grafana Alerting:          alertname  grafana_folder
Managed by Database Observability:     server_id  op
```

Note that `job` and `instance` are prohibited *as attribution labels* while remaining essential operational labels. This is precisely why neither can serve as our identity key.

### Label budget per log stream

> **Added in v0.2 — for review.** Loki indexes at most 15 labels per stream and rejects streams with more at ingest. Tier 1 alone uses 7. Some integrations need many of the rest.

| Log source | Integration-required labels | Tier 1 not already counted | Tier 2 in use | Total | Against 15 |
|---|---|---|---|---|---|
| Category 2 SaaS export | none | 7 | `data_class` | 8 | 7 spare |
| Category 3 Linux host (Linux Server integration) | 9: `job`, `instance`, `unit`, `boot_id`, `transport`, `level`, `service_name`, `name`, `source` | 6 | `data_class` | 16 | **1 over** |
| Category 1 OTLP logs | Loki's promoted resource attributes | varies | varies | count on real streams | verify |
| Synthetic Monitoring | added by the product, plus up to 10 custom | varies | none | count on real streams | verify |

When a source is over budget, keep in this order: integration-required labels, then `service_name` and `deployment_environment`, then `team` and `application`. Move `tier`, `source_class` and `data_class` for that source to structured metadata, and record the exception. Conformance reporting for that source must then read structured metadata. **[review]**

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

Use the same key strings on every signal: labels on metrics and logs, resource attributes on traces (section 9). Then one name covers all three, and the Label Name alias in the attribution setup is not needed. **[v0.2]**

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

> **Added in v0.2 — for review.** This query counts what the inventory *says*, not what telemetry actually *carries*. Typos, the `unassigned` sentinel and hand-written rules that have drifted will not show up in it. Compare it regularly with the combinations and the unattributed share that Cost Management reports. It is also unclear what Grafana Cloud does if the real count passes 1,000 *after* attribution is configured; check with Grafana before relying on the 800 alert as the safety margin. **[review]**

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

> **Added in v0.2 — for review.** With a manual inventory there is nothing to generate these series automatically. One conceptual option: the Platform team keeps a static file of `service_info` lines in Prometheus text format, and Alloy exposes it through the node exporter textfile collector, one file per stack. Each stack should receive only its own environments (section 14). `data_class` stays in the series only if decision 6 keeps it. The mechanism is not decided. **[review]**

---

## 9. Traces

> **Added in v0.2 — for review.** This section is new; traces are in scope (decision 7).

Traces have no labels. They carry **resource attributes**, which describe the process that produced the spans, and **span attributes**, which describe one operation. Tier 1 identity belongs on resource attributes, never on span attributes: it is one value per service, it applies to every span that service emits, and it is what TraceQL `resource.` queries, span metrics and cost attribution read.

### Attribute names

| Tier 1 key | Trace resource attribute | Set where | Standard or custom |
|---|---|---|---|
| `service_name` | `service.name` | SDK, `OTEL_RESOURCE_ATTRIBUTES` | OpenTelemetry standard |
| `service_namespace` | `service.namespace` | SDK | OpenTelemetry standard |
| `deployment_environment` | `deployment.environment.name` | SDK | OpenTelemetry standard |
| `application` | `application` | Alloy, from the inventory | Custom |
| `team` | `team` | Alloy, from the inventory | Custom |
| `tier` | `tier` | Alloy, from the inventory | Custom |
| `source_class` | `source_class` | Alloy, from the inventory | Custom |
| `service_version` (Tier 2) | `service.version` | SDK | OpenTelemetry standard |

**Standard keys use OpenTelemetry's dotted names.** Grafana Cloud converts them to the underscore label names when traces become span metrics or when logs arrive over OTLP, so `service.name` and `service_name` are the same identity.

**Custom keys use the bare label name, with no prefix.** OpenTelemetry has no standard attribute for team, application, tier or category. Its guidance is to prefix custom attributes with an organisation namespace (for example `<org>.team`) so they cannot clash with future standard names. We deliberately do not, because the conversion to labels turns dots into underscores: `<org>.team` would arrive as `<org>_team`, not `team`, and the single identity breaks. That would need a rename rule on every path and the Label Name alias in cost attribution. The trade-off is a small risk that OpenTelemetry later defines a clashing bare `team` or `application`; check at each OpenTelemetry upgrade. **[review]**

**Never use the `service.` prefix for custom keys** (`service.team`, for example). That namespace belongs to OpenTelemetry.

### Why the custom keys are set in Alloy, not the SDK

`team` is resolved from `application` (section 7). If each service sets its own `team` in code, the values drift away from the inventory and the attribution guarantee is lost. Services set only the standard keys; Alloy adds the rest, matching on `service.name`:

```text
Conceptual pipeline, not working configuration:

otelcol.receiver.otlp
  -> otelcol.processor.transform "identity"
       for each inventory entry, one statement, written by hand:
         where resource service.name == "checkout-api"
           set resource application  = "shop-checkout"
           set resource team         = "checkout"
           set resource tier         = "tier1"
           set resource source_class = "owned"
       last, for anything not matched:
         where resource team is missing  set resource team = "unassigned"
  -> otelcol.processor.batch
  -> otelcol.exporter.otlp  (Tempo, stack chosen by deployment.environment.name)
```

### Points to verify before relying on this

- **Span metrics.** If span metrics should carry `team` and `application`, they must be added as dimensions in the metrics-generator. In Grafana Cloud this is managed configuration; confirm with Grafana how to add dimensions. They add little cardinality, because both keys follow from `service.name`. **[review]**
- **Cost attribution for traces.** Confirm that trace attribution can use the resource attributes `team` and `application` directly. **[review]**
- **Personal data in spans.** Span attributes such as URLs, query parameters or database statements can contain personal data. Redact in the same `transform` stage, before export.

---

## 10. Label lifecycle

> **Added in v0.2 — for review.** This section is new. It shows where each piece of identity is set, enriched, changed, dropped or passed through untouched, from source to query.

```text
  CAT 1 owned app       CAT 2 SaaS            CAT 3 COTS on EC2        CAT 4 other
  OTel SDK sets         vendor API/export     exporter + log files     whatever arrives
  service.* and         no agent possible     integration job
  deployment.env.*
        |                     |                      |                     |
        +---------------------+----------+-----------+---------------------+
                                         |
 [A] COLLECT     Alloy: OTLP receiver, scrape, file tail, API pull
                 PASS     everything as received
                 SET      job, instance to the integration-required value      (cat 3)
                 USE      __meta_* discovery labels, dropped automatically after
                                         |
 [B] ENRICH      Alloy relabel / transform, rules written by hand from inventory
                 SET      service_name, service_namespace, deployment_environment (cat 2-4)
                 COPY     service.* resource attributes onto metric series      (cat 1)
                 ENRICH   application, team, tier, source_class, data_class     (all)
                                         |
 [C] CLEAN       Alloy relabel / loki.process / transform
                 DROP     label keys: trace_id, request_id, user_id, tenant_id
                 MOVE     trace_id, request_id to structured metadata           (logs)
                 REDACT   personal data in log lines and span attributes
                                         |
 [D] DEFAULT     Alloy, applied last
                 DEFAULT  service_name=unknown_service  team=unassigned  source_class=unknown
                                         |
 [E] ROUTE       Alloy writers
                 ROUTE    by deployment_environment: production or development stack
                                         |
 ============ boundary: below this line we do not control the behaviour ============
                                         |
   BYPASS  Synthetic Monitoring, k6, Faro, Grafana-hosted integrations
           labels set in each product's own config ------------------+
                                         |                            |
 [F] INGEST      Grafana Cloud    <------------------------------------+
                 CONVERT  OTLP metrics: resource attributes go to target_info;
                          only job and instance become series labels
                 DERIVE   job = service.namespace/service.name              (OTLP)
                 DERIVE   Loki service_name when absent, else unknown_service
                 REJECT   log streams over 15 labels; structured metadata over limits
                                         |
 [G] USE         dashboards, alerts, cost attribution (per stack, from enable date)
                 JOIN     telemetry to service_info on service_name
```

What happens to each property at each stage. A dash means the stage leaves it alone.

| Property | Origin | A Collect | B Enrich | C Clean | D Default | F Ingest |
|---|---|---|---|---|---|---|
| `service_name` | SDK (cat 1); inventory (cat 2–4) | pass | set (cat 2–4); copy to metrics (cat 1) | — | default `unknown_service` | Loki derives if absent |
| `service_namespace` | SDK (cat 1); inventory (cat 2–4) | pass | set; copy to metrics (cat 1) | — | — | part of derived `job` |
| `deployment_environment` | SDK (cat 1); inventory (cat 2–4) | pass | set; copy to metrics (cat 1) | — | — | — |
| `application`, `tier` | inventory | — | enrich | — | — | — |
| `team` | inventory, via `application` | — | enrich | — | default `unassigned` | — |
| `source_class` | inventory | — | enrich | — | default `unknown` | — |
| `data_class` **[review]** | inventory | — | enrich | — | — | — |
| `job` | integration or OTLP | set (cat 3), else pass | never changed | — | — | derived for OTLP |
| `instance` | runtime or collector | set (cat 3), else pass | never changed | — | — | derived for OTLP |
| `service_version` | SDK | pass | — | — | — | — |
| `cluster`, `namespace`, `pod` | Kubernetes (optional) | pass if present | — | — | — | — |
| `trace_id`, `request_id` | application | pass | — | drop label; move to structured metadata | — | — |
| `user_id`, `session_id`, `tenant_id` | application or vendor | pass | — | drop label; structured metadata only if needed | — | — |
| `cmdb_ci`, `hopex_id` | inventory only | never enters the pipeline | — | — | — | — |
| Personal data in content | application or vendor | pass | — | redact | — | — |
| `__meta_*`, `__*` | Alloy discovery | used by `discovery.relabel` | dropped automatically | — | — | — |

---

## 11. Pipeline capabilities

> **Added in v0.2 — for review.** This section is new. It describes, at the conceptual level, what Alloy can and cannot do for this contract. It is not working configuration; confirm each capability against current Alloy documentation before building on it.

| Need | Possible | How, conceptually | Limits |
|---|---|---|---|
| Add a fixed label to everything from one source | Yes | A relabel rule with a fixed replacement, in that source's pipeline | One pipeline per source |
| Look up `team` and `application` from `service_name` | Yes, by hand | One conditional rule per inventory entry, matching on `service_name` | No native lookup from a data file; rule count grows with the inventory. Check whether newer Alloy features can loop over a file. **[review]** |
| Set a default when a label is missing | Yes | Replace only where the current value is empty | Must run last |
| Drop a label key | Yes | `labeldrop` or `labelkeep` | Dropping every label drops the series or entry |
| Drop whole series or log entries | Yes | `drop` or `keep` rules | Several `keep` rules combine as AND |
| Move a log label to structured metadata | Yes | `loki.process` structured metadata stage | Per-line limits: 64 KB, 128 entries |
| Redact log content | Yes | `loki.process` replace stage | `loki.relabel` cannot read content |
| Set or change trace resource attributes | Yes | `otelcol.processor.transform` | Rules written by hand, as above |
| Redact span attributes | Yes | `otelcol.processor.transform` | Must run before export |
| Put OTel resource attributes on metric series | Yes | Copy them in the pipeline before export, or configure promotion in Grafana Cloud | Promotion options need verifying **[review]** |
| Route by environment to a stack | Yes | One writer per stack, with keep rules on `deployment_environment` | Every path needs both writers |
| Keep `instance` identical on metrics and logs | Yes, by discipline | Set the same value in both pipelines | Nothing checks it automatically |
| Label telemetry that bypasses Alloy | **No** | Set labels in each product: check labels, k6 project labels, Faro metas | Limits differ per product (section 19) |
| Change data already stored | **No** | Not possible | Cost attribution is never backfilled |
| Use a log label to decide a metric label | **No** | Each signal has its own components; give each signal the same rules | Duplicated rules can drift |
| Detect an unregistered `service_name` | Partly | Match against a list of registered names; anything else counts as unknown | The list must be updated with the inventory |
| Measure Tier 1 coverage | Partly | Alloy counts entries processed and written per component, not label coverage | Measure coverage with queries in Grafana |
| Enforce the 15-label Loki limit | **No** | Loki rejects over-limit streams at ingest | Budget by design (section 5) |
| Check that inventory data is correct | **No** | Platform team review | Manual |

---

## 12. Injection rules per category

> **Changed in v0.2 — for review.** The configuration in this section is illustrative only. It shows the shape of each rule, has not been run against Alloy, and must not be copied into production as it stands.

### Category 1 — applications we control, on AWS

Set OpenTelemetry resource attributes at the source:

```text
OTEL_RESOURCE_ATTRIBUTES="service.name=checkout-api,\
service.namespace=shop,\
deployment.environment.name=production,\
service.version=1.4.2"
```

**Critical gotcha.** OTLP resource attributes do not automatically become labels on every metric series. They populate `target_info`, and only `job` and `instance` are promoted by default. Loki promotes a defined subset of resource attributes to labels, which includes `service.name`, `service.namespace` and `deployment.environment.name` but **not** `team`, `application`, `tier` or `source_class`.

Tier 1 labels must be present on the billed and queried series. On metrics, that includes `service_name`, `service_namespace` and `deployment_environment` as well as the four custom keys: none of them is on metric series by default. **[v0.2]** Therefore:

- either configure resource-attribute promotion for all seven Tier 1 keys on the metrics path, and for the four custom keys on the logs path, and verify on real series **[v0.2]**
- or inject them in Alloy from the registry: copy the standard keys from the resource attributes, and add the custom keys by matching on `service.name` **[v0.2]**

The Alloy injection is the reliable path and is consistent with categories 2 to 4. Prefer it, and treat promotion as an optimisation to validate later. For traces, see section 9. **[v0.2]**

### Category 2 — SaaS where we are administrator

No agent is possible. Ingest what the vendor exposes, and apply every Tier 1 label in the pipeline:

```alloy
// Illustrative only: not validated against Alloy.
loki.relabel "saas_salesforce" {
  forward_to = [loki.write.production.receiver]

  rule {
    target_label = "service_name"
    replacement  = "salesforce-crm"
  }

  // ...one rule per Tier 1 key, values copied from the inventory entry:
  // service_namespace=crm  application=crm-platform  team=sales-systems
  // tier=tier1  source_class=saas  deployment_environment=production
}
```

Availability and performance for this category are usually best measured with Synthetic Monitoring rather than vendor metrics. Add the same identity as custom check labels, respecting the 10-custom-label cap and the reserved `job`, `instance` and `probe` names.

Cyber sign-off is required before ingesting any SaaS audit-log export. Redact in the Alloy pipeline with `loki.process`, before the write, not at query time; `loki.relabel` cannot read log content. **[v0.2]**

### Category 3 — purchased applications on our EC2

We control the host and the collector, not the code. Use the vendor integration as published, then add identity:

```alloy
// Illustrative only: not validated against Alloy.
discovery.relabel "cots_billing" {
  targets = prometheus.exporter.unix.billing.targets

  // The integration requires exactly these values. Never set anything else.
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }

  // ...then one rule per Tier 1 key, values copied from the inventory entry:
  // service_name=acme-billing  service_namespace=finance  application=finance-billing
  // team=finance-systems  tier=tier1  source_class=hosted-cots
  // deployment_environment=production
}
```

> **Changed in v0.2 — for review.** The v0.1 example left out two Tier 1 labels (`service_namespace` and `deployment_environment`). Its comment also said "leave the integration's own job value untouched" directly above a rule that sets `job`. The rule is correct, because the integration needs that exact value; the comment now says so.

Rules specific to this category:

- Do not override `job`, `server_id` or `op` with any value other than the one the integration requires **[v0.2]**
- `instance` must carry an identical value on metrics and logs for the same target, and Database Observability additionally requires the `hostname:port` form
- Set the same Tier 1 values in the matching log pipeline; metrics rules do not reach logs **[v0.2]**
- Host metrics on a dedicated host are attributed to that host's `service_name`; on shared hosts use a platform service such as `shared-compute` with `source_class: other`
- Watch the label budget on host logs: the Linux Server integration alone uses 9 labels (section 5) **[v0.2]**

### Category 4 — everything else

The catch-all must never silently drop identity. Apply a default rule last, on every metrics path and, with `loki.relabel`, on every logs path: **[v0.2]**

```alloy
// Illustrative only: not validated against Alloy.
prometheus.relabel "default_identity" {
  forward_to = [prometheus.remote_write.production.receiver]

  rule {
    source_labels = ["service_name"]
    regex         = ""
    target_label  = "service_name"
    replacement   = "unknown_service"
  }

  // ...the same pattern for:  team -> "unassigned"   source_class -> "unknown"
}
```

Then alert on the volume of `service_name="unknown_service"`, `team="unassigned"` and `source_class="unknown"`. An unknown bucket that is measured shrinks; one that is dropped never does. **[v0.2]**

---

## 13. Correlation strategy

| Hop | Join key | Mechanism |
|---|---|---|
| Metrics to traces | `service_name` + `deployment_environment` | Exemplars, span metrics. Category 1 metrics carry these only once they are copied or promoted (section 12). **[v0.2]** |
| Logs to traces | `trace_id` | Loki structured metadata, never a label |
| Application to infrastructure | `instance` | Same `instance` value on metrics and logs |
| Frontend to backend | Trace context (`traceparent` header) | Faro propagates trace context to backend calls. The frontend has its own `service_name`, set from the Faro app name; it does not share the backend's. **[v0.2]** |
| Synthetics to service | `service_name` as a custom check label | Filtering and alert routing |
| Profiles to service | `service_name` | Deferred: profiles are not yet in scope (decision 8). Pyroscope tags must match `[a-zA-Z_][a-zA-Z0-9_]*`; no dots. **[v0.2]** |
| Anything to cost | `team`, `application` | Cost Management and Billing |
| Anything to CMDB | `service_name` to `cmdb_ci` | Registry lookup, surfaced as a dashboard link |

The rule to remember: **one identity, many sources.** `service_name` must hold the identical value whether it originated in an SDK, a relabel rule or a registry lookup.

---

## 14. Multi-stack implications

With separate production and development stacks:

- Cost attribution is configured **per stack**; both must be configured with the same two labels, and there is no native cross-stack rollup **[v0.2]**
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

## 15. Conformance and measurement

Conformance is a number we track, not a campaign we run.

| Metric | Target | Source |
|---|---|---|
| Series and streams carrying all Tier 1 labels with non-sentinel values, by `source_class` | 95% | Conformance dashboard **[v0.2]** |
| Unattributed cost | under 5% | Cost Management |
| Registered services with no telemetry in 24h | 0 | `service_info` join |
| Telemetry whose `service_name` is not in the registry, excluding `unknown_service` | 0 | Inverse join **[v0.2]** |
| `team` x `application` combinations | under 800 | Section 7 query, checked against Cost Management **[v0.2]** |

Alerts worth having from day one:

- Volume of `service_name="unknown_service"`, `team="unassigned"` or `source_class="unknown"` rising **[v0.2]**
- Unattributed percentage above 5%
- Conformance for any `source_class` below 95%
- Attribution combinations above 800

Cardinality hygiene, monthly: review the cardinality management dashboards, act on the used/unused split, and run `logcli series '{}' --analyze-labels` against the busiest tenants.

---

## 16. Governance

### Onboarding gate

No source is connected until:

1. A registry entry exists in the Platform team inventory, with `service_name` derived from the CMDB CI and `application` traced to Hopex **[v0.2]**
2. `application` has exactly one owning `team`
3. `tier` is set; `data_class` too, if decision 6 makes it mandatory **[review]**
4. `source_class` is declared
5. Cyber has signed off, for category 2 log exports
6. The Tier 1 labels are visible on real telemetry in the target stack, including metrics for category 1 **[v0.2]**

### Keeping the manual inventory honest

> **Added in v0.2 — for review.** With no generator, three copies of the same facts exist: the inventory, the hand-written Alloy rules, and the `service_info` file. Reconcile them monthly, and after every onboarding: every inventory entry has matching rules, every rule matches an inventory entry, and `service_info` matches the inventory. The sentinel alerts in section 15 catch the most common drift, a service with no rule.

### Exceptions

Any departure from this contract is recorded as an ADR in `docs/adr/` (folder to be created), stating the constraint, the workaround, the blast radius and a review date. Undocumented exceptions are defects. **[v0.2]**

### Versioning and review

Semantic versioning. Renaming or removing a Tier 1 key is a major version and needs a migration plan, because it breaks dashboards, alert routing and attribution history simultaneously. Changing an individual `service_name` needs the same care (section 4, stability rule). Reviewed quarterly, and whenever a new product surface is onboarded. **[v0.2]**

---

## 17. Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `job` as the service identity | Claimed by integrations, prohibited for attribution | `service_name` |
| Environment inside the service name | Doubles the namespace, breaks grouping | `deployment_environment` |
| `container_id`, `trace_id` as labels | Unbounded, fragments streams | Structured metadata **[v0.2]** |
| Adding a label "just in case" | Index growth and fragmentation for nothing | Add when a query needs it |
| `team` declared per service | Multiplies attribution combinations | Resolve `team` from `application` |
| Slash in `service_name` | Breaks Application Observability grouping | `service_namespace` |
| Renaming labels per product to look tidy | Breaks the mixins and dashboards that assume them | Preserve reserved names |
| Dropping unlabelled telemetry | The gap becomes invisible | Default to the sentinels and alert **[v0.2]** |
| Defaulting to a legitimate value | Hides the defect the default exists to expose | Use a sentinel such as `unknown` **[v0.2]** |
| CMDB identifiers as labels | Cardinality with no query value | Registry fields |
| Custom trace attributes with an org prefix or `service.` prefix | Breaks the single identity across signals | Bare names (section 9) **[v0.2]** |

---

## 18. Open decisions

| # | Decision | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | Confirm the `deployment_environment` enumeration | v1.0 | Section 14 table |
| 2 | Confirm `application` count in Hopex is below 1,000 per stack | Before enabling attribution | Verify with section 7 query |
| 3 | CMDB-to-registry sync | — | **Resolved in v0.2:** manual inventory, Platform team **[v0.2]** |
| 4 | `data_class`: mandatory, recommended or dropped; values; whether it drives access control | Phase 2 | Set where known, do not block onboarding **[review]** |
| 5 | Owner of the registry | — | **Resolved in v0.2:** Platform team **[v0.2]** |
| 6 | Whether host metrics on shared hosts roll up to a platform service | Phase 2 | `shared-compute`, `source_class: other` |
| 7 | Custom trace attributes: bare names or org-prefixed | Before tracing rollout | Bare names (section 9) **[review]** |
| 8 | Policy for log sources over the 15-label budget | Before category 3 logs | Keep order in section 5 **[review]** |
| 9 | How `service_info` is produced from a manual inventory | Phase 1 | Static file via textfile collector **[review]** |
| 10 | Behaviour when attribution combinations pass 1,000 after setup | Before enabling attribution | Ask Grafana **[review]** |
| 11 | Prefix for `service_name` values starting with a digit | Before first such service | `svc-` **[review]** |
| 12 | Keep or drop `provider` | v1.0 | Keep **[review]** |

---

## 19. Reference: platform limits

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
| Pyroscope tag format (profiles deferred) | `[a-zA-Z_][a-zA-Z0-9_]*`, no dots **[v0.2]** |
| Grafana IRM labels, guidance | 4 to 5 per alert |

Source documentation for every constraint above is catalogued in the [label management digest](../index.html) that accompanies this repository.

---

## 20. Changes in v0.2

> **Added in v0.2 — for review.** Every change from v0.1, for the reviewer to accept or reject. Items tagged `**[review]**` in the body need a decision; the rest are corrections.

Decisions applied from the owner:

- Traces are in scope; section 9 added (decision 7)
- Profiles are not yet in scope (decision 8)
- The registry is a manual inventory maintained by the Platform team; no generator (decision 9)
- Kubernetes is not targeted; `cluster`, `namespace` and `pod` are optional (decision 10)
- `data_class` status is open and marked for review (decision 6, section 5)

Corrections to v0.1:

- Section 1: the "single enforcement point" claim was false; added the paths that bypass Alloy
- Section 1: "three quarters of the estate" corrected to "three of our four categories"
- Section 4: naming algorithm made deterministic (fixed environment word list, leading-digit prefix, trim after truncate)
- Section 4: stability rule added; a `service_name` no longer changes when the CMDB name changes
- Section 5: `pod` moved out of Tier 3; `data_class` inconsistency surfaced
- Section 5: "Forbidden as label keys" renamed "Restricted keys"
- Section 5: sentinel values added; `source_class` no longer defaults to the legitimate value `other`; `unknown` became `unknown_service`
- Section 5: label budget table added; Linux host logs exceed Loki's 15-label limit
- Section 7: same key strings on every signal; caveat that the combination query measures the inventory, not telemetry
- Section 8: production of `service_info` from a manual inventory marked open
- Section 12: category 1 metrics also lack `service_name`, `service_namespace` and `deployment_environment` by default
- Section 12: category 3 example completed and its contradictory comment fixed
- Section 12: default rules extended to logs; redaction moved to `loki.process`
- Section 12: all configuration marked illustrative; rule blocks written one attribute per line
- Section 13: frontend-to-backend correlation corrected to trace context propagation
- Section 15: conformance targets adjusted for sentinels
- Section 16: inventory reconciliation added; `docs/adr/` noted as not yet created

New in v0.2:

- Section 9, Traces, including the attribute naming for `team` and `application`
- Section 10, Label lifecycle diagram and per-property table
- Section 11, Pipeline capabilities: what is and is not possible
- Open decisions 7 to 12

Outside this document:

- `tools/build-contract.js`: review callouts and tags are highlighted in the HTML; contents entries with review items are marked; the date comes from the **Updated** field instead of the build day; a `--check` mode was added; unsupported Markdown now fails the build; the print layout keeps the title and version
- `README.md`: stale references corrected
- `.gitignore`: `.kiro/` ignored
