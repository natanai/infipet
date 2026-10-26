# Audit evidence and retention

Current application revision: **life-v10**. [Project goal](../GOAL.md) and [maintenance notes](../REPO-MAINTENANCE.md).

The active repository keeps:
- five small frozen household source/provenance fixtures required for audit tests;
- historical narrative reports (`.md`) from v6/v7 and household experiments;
- complete recent evidence for life-v8, life-v9 and life-v10;
- source code, tests, reference source data and reproducibility tooling elsewhere in the repository.

Large generated PNG/JSON/HTML/compressed audit payloads from older runs are **not in the active working tree**. They remain on the read-only [pre-cleanup archive branch](https://github.com/natanai/infipet/tree/archive/pre-cleanup-2026-10-25/docs/audits). Links in historical reports to removed artifacts must be opened against that archive. The original Git commit history remains intact.

Relevant current/historical evidence:
- [life-v10 somatic growth](life-v10/somatic-growth.md)
- [life-v10 surface expression](life-v10/surface-expression.md)
- [life-v9 retro report](life-v9/retro/REPORT.md)
- [life-v7 human feedback](life-v7/HUMAN-FEEDBACK.md)
- [life-v6 report](life-v6/REPORT.md)

**Do not infer completion from preserved reports.** The latest v10 staged smoke data recorded no passing full-path reproductions. Reports from earlier engine revisions do not certify current implementation.

The audit tools may write further generated data into `docs/audits/`; those payloads are ignored by default. Keep a small named fixture only when a test or investigation explicitly depends on it, and document why.
