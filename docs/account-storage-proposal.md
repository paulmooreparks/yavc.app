# Portable account storage proposal

This proposal accompanies the approved guest VFS migration. Paul has requested discussion of accounts, free and paid storage, infrastructure capacity and pricing. The account service, infrastructure purchases and commercial terms are not approved implementation work yet. The canonical Architectural Principles document named in DESIGN.md applies.

## The account service

I recommend PostgreSQL for accounts, file ownership, directory metadata, revisions, quota reservations and a change log. A private S3-compatible object store should hold every file's bytes, including Markdown and source code. One shared database can isolate accounts by their owner identifier; separate databases or buckets per person are unnecessary.

The current applets already read and conditionally save through host resource services. An account-backed host can supply those services while retaining the same applets. File identifiers should remain stable across rename and move. Account-scoped file resources should have discoverable URLs, strong revision validators and links to legal operations. Quota exhaustion removes creation/upload affordances from representations, while read, download and deletion remain available. Every operation independently verifies account ownership and permissions on the server.

An upload first reserves its bounded bytes in a database transaction. The server streams into an unpublished immutable object, then finalizes its file revision and quota counters under the captured revision condition. Failed or abandoned uploads expire and release reservations. A cleanup job removes orphan objects. PostgreSQL and S3 do not share an atomic transaction; upload reservations and finalization explicitly handle the interval between them. Concurrent saves cannot both spend the last available bytes or silently replace the same revision.

The host retains an account-scoped, bounded IndexedDB cache and an offline outbox. A local save and a successful cloud save must have distinct status. Reconnection sends idempotent mutations against the captured revision. Conflicts retain both versions and offer resolution. Guest files move into an account only through an explicit import with acknowledged results; the browser copy remains until that succeeds. Signing in on another device retrieves the same server-side home. Account APIs also remove the current separation between desktop and standalone applet homes. Sign-out must handle unsent changes explicitly and clear private cached data on shared devices; switching accounts must never expose another account's cache.

Authentication should use passkeys with an explicit recovery path and verified account contact. Sessions need secure HttpOnly cookies, CSRF protection and explicit allowed origins for standalone applications. No user file is a public object by default. Private metadata and mutable file responses must bypass shared Cloudflare caching. Authenticated downloads need correct media types and `nosniff`; untrusted HTML must not execute as site content. Backup credentials and restore access must be separate from routine application write access.

## Proposed limits and plans

The guest browser store defaults to 100 MiB per file, 1 GiB total live file contents and 10 MiB of editable source. The browser's own storage quota remains an additional ceiling. These local limits do not allocate server storage.

| Account plan | Live file allowance | Stored file limit | Editable source | Proposed price |
| --- | ---: | ---: | ---: | ---: |
| Free | 1 GiB | 100 MiB | 10 MiB | $0 |
| Plus | 10 GiB | 100 MiB | 10 MiB | US$5/month or US$50/year |
| Larger plan, if demanded | 50 GiB | 100 MiB initially | 10 MiB initially | US$10/month or US$100/year |

The pricing is a product hypothesis, not a released offer. Larger storage does not promise larger rich documents. Renderer, import, export and recovery budgets still need performance testing. File contents and saved source use byte-based limits; encodings, filenames and JSON serialization must not create hidden character-count quotas. Additional entry-count and request-rate limits protect metadata and abuse costs.

Trash should count toward the live allowance. History needs its own bounded retention budget, with free and paid retention policies decided before launch. Neither unlimited history nor unlimited downloads should be promised. Repeated overwrites, uncompleted uploads and retained versions can otherwise defeat the visible quota. Storage reports should distinguish current files, trash and history.

## Current host and expansion

The deployment record identifies a Shared CPU 2 GB instance in Chicago. Its published specification is 1 vCPU, 50 GB disk and 2 TB monthly transfer at US$12/month. The specification is verified against current pricing; the deployed plan, free disk and utilization have not been measured in this work.

The whole 50 GB is not available for account files. Ubuntu, images retained for rollback, logs, the metadata database and maintenance need space. Reserving 20 GB leaves a provisional 30 GB budget, before file history or any backups placed on that disk. That is about 28 fully used 1 GiB allowances, not evidence of support for 28 concurrent editors. A backup on that same disk also fails with that disk. Actual limits require a disk inventory and load test. The deployment notes also specify a 512 MiB application-container memory cap; resizing the VM alone does not change that cap. Upload concurrency and process limits need to be measured and budgeted separately.

The current instance can host an invite-only pilot if utilization permits. I would resize to Shared CPU 4 GB before a public paid launch, stream uploads with bounded concurrency, and keep file contents in object storage from the beginning. A 4 GB instance can initially run the Go service and a carefully limited PostgreSQL process together. A separate managed database improves operational isolation later. Compute upgrades should follow memory pressure, CPU saturation, database latency and request measurements rather than the number of registered accounts or the total stored bytes.

| Stage | Compute | Monthly compute price | Base infrastructure planning budget |
| --- | --- | ---: | ---: |
| Invite-only pilot | Existing 2 GB, 1 vCPU, 50 GB disk | $12 | $22 to $27 |
| Small paid launch | Shared 4 GB, 2 vCPU, 80 GB disk | $24 | About $39 |
| Separate database | Shared 4 GB plus managed PostgreSQL 2 GB | $24 + $32 | About $71 |
| More application headroom | Shared 8 GB plus managed PostgreSQL 2 GB | $48 + $32 | About $95 |

The budgets include the object-storage minimum and a provisional independent-backup allowance of $5 to $10. They exclude storage above the included pool, transfer overage, email, payment fees, taxes, monitoring and labor. They are planning estimates, not vendor bundles. Managed PostgreSQL's quoted $32 plan has one node and is not high availability. Multi-instance availability requires a separately designed database failover, load-balancing and restore policy; buying a bigger application VM does not provide it.

## Storage economics

Current North American object storage costs US$5/month including 250 GB, then $0.02 per additional GB-month. It adds 1 TB to the account's monthly global transfer pool; overage is $0.005/GB in this region. Current documentation says requests are not charged and that any request charges will not appear before October 1, 2027. Pricing should be rechecked before launch or region changes.

A fully used 1 GiB allowance therefore costs about $0.0215/month for one live copy at the marginal storage rate. A fully used 10 GiB allowance costs about $0.215. Four live-copy equivalents, reserved conservatively for bounded history and independent backups, raise those estimates to $0.086 and $0.86 respectively, before transfer and other costs. Four is a modeling assumption, not a retention contract or a guarantee that backup vendors charge the same rate. Minimum charges and redundant backup destinations affect small installations.

At full utilization, 1,000 free accounts represent roughly 1.07 TB of live files. A four-copy planning reserve is roughly 4.29 TB, about $86/month in modeled storage at this rate. With 100 Plus accounts at full allowance, live data is also roughly 1.07 TB, while monthly subscription revenue is $500 before payment fees and tax. Real usage may be lower, but the service needs a budget for the upper bound. Open registration should start with controlled enrollment, verified contact, rate limits, storage reservations and cost alerts.

I recommend starting with the single $5 Plus plan. Account persistence, reliable saves, restore capability and usable document tools justify the product price; the offer is not solely a resale of disk space. Payment processing, email delivery, support and the cost of operating restores will matter more than the bytes for many customers. AI consumption, if added, needs separate metering and pricing.

The commodity-storage comparison is unfavorable: [Google One](https://one.google.com/about/plans?hl=en_US) and [Microsoft 365 Basic](https://www.microsoft.com/en-us/microsoft-365/p/microsoft-365-basic/cfq7ttc0ktxs) currently advertise US plans with 100 GB at $1.99/month. A $5 yavc.app plan therefore needs to earn its price through the Markdown workflow, portable applets, integration and service quality. The pricing hypothesis needs validation with actual users before a public offer.

## Work before an account launch

The next design must specify authentication and recovery, guest import, offline synchronization, conflict resolution, bounded history/trash, quota enforcement, private resource caching, billing lifecycle and account export/deletion. Acceptance needs two-device and cross-subdomain tests, competing saves and uploads, interrupted finalization, offline recovery, quota exhaustion, ownership attacks, restore rehearsal and measured load. No production infrastructure or account data is changed by the guest migration.

## Sources checked on 2026-11-10

The prices and provider behavior above come from [Akamai CPU pricing](https://www.akamai.com/cloud/pricing/cpu), [Object Storage pricing](https://www.akamai.com/cloud/pricing/object-storage), [Object Storage request pricing](https://techdocs.akamai.com/cloud-computing/docs/object-storage-pricing), [managed database pricing](https://www.akamai.com/cloud/pricing/databases) and the [public Object Storage pricing API](https://techdocs.akamai.com/linode-api/reference/get-object-storage-types). The cost arithmetic, plan recommendations and capacity budgets are this proposal's estimates. The current plan identification comes from `docs/deploy.md` and still needs live verification.
