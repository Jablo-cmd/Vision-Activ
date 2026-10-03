# Vision Activ — Documentation & Change Control
**Status:** Authoritative control document | **Version:** 1.0 | **Date:** 3 October 2026
## Authority
The Transformation Blueprint, Transformation Passport and Transformation Academy supplied for this project are source material. The numbered documents in docs/ are the implementation authority derived from them.
## Change order
Source interpretation → Master specification → affected domain specification → architecture/data decision → implementation → tests → traceability.
## Stale-document rule
A document is stale when it describes retired scope, obsolete terminology, superseded architecture, contradictory workflows or assumptions outside current scope. Stale material must be deleted or moved to a clearly labelled historical archive; it must never sit beside authoritative requirements without an explicit historical label.
## Implementation rule
No production code change should intentionally contradict an authoritative specification. If a requirement is found to be wrong or incomplete, correct the documentation and record the change before implementation continues.
## Review
Before release, reconcile README, docs, migrations, tests and UI terminology against the current specification set.