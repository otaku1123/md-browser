# Release Plan v2.0

A sample document rendered by **MD Browser** — straight from a local `.md` file.

## Overview

| Item | Owner | Status |
|------|-------|--------|
| API freeze | Backend | ✅ Done |
| UI polish | Frontend | 🚧 In progress |
| Docs | Tech writing | ⏳ Planned |

- [x] Feature complete
- [x] Security review
- [ ] Release notes

## Architecture

```mermaid
flowchart LR
  U[User] --> W[Web App]
  W --> A{API GW}
  A --> S1[Auth Service]
  A --> S2[Order Service]
  S2 --> D[(Database)]
```

## Deployment Flow

```mermaid
sequenceDiagram
  participant Dev
  participant CI
  participant Prod
  Dev->>CI: git push
  CI->>CI: build & test
  CI->>Prod: deploy
  Prod-->>Dev: health check OK
```

## Configuration

```ts
export const config = {
  region: 'us-east-1',
  replicas: 3,
  featureFlags: { newCheckout: true },
};
```

## Schedule

### Week 1 — Freeze

### Week 2 — Verification

### Week 3 — Launch
