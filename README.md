# n8n-nodes-nadia

n8n community node for [Nadia](https://usenadia.com) — schedule social posts,
upload media, read analytics, and start a workflow when a post is published or
a comment or DM comes in.

Two nodes ship in this package:

| Node | What it does |
|---|---|
| **Nadia** | actions — create posts, upload media, list channels, read analytics. Also available to the AI Agent as a tool. |
| **Nadia Trigger** | starts a workflow on `post.published`, `comment.received`, `dm.received` or `automation.triggered`. It registers its own webhook, so there is nothing to set up in the app. |

## Installation

Settings → **Community Nodes** → **Install** → `n8n-nodes-nadia`.

## Credentials

| Field | Notes |
|---|---|
| **API Key** | Settings → Developers in Nadia. An OAuth token (`pos_…`) works too. |
| **Host** | `https://app.usenadia.com/api` for the hosted app. |

> **Self-hosting?** The API lives behind `/api`, so the host must end with it —
> `https://social.example.com/api`, not `https://social.example.com`. This is
> the single most common setup mistake.

## Operations

| Operation | Endpoint |
|---|---|
| Create Post | `POST /posts` |
| Get Posts | `GET /posts` |
| Delete Post | `DELETE /posts/:id` |
| Find Free Slot | `GET /find-slot/:id` |
| Upload File | `POST /upload` (binary from a previous node) |
| Upload File From URL | `POST /upload-from-url` |
| Get Channels | `GET /integrations` |
| Get Brands | `GET /groups` |
| Get Channel Settings | `GET /integration-settings/:id` |
| Get Analytics | `GET /analytics/:id` |

### Channels and brands are dropdowns

You never paste a UUID. **Channel** is loaded from your account, and picking a
**Brand** first narrows the list to that brand's channels.

### Per-provider settings are read from the API

Each network requires its own settings — TikTok alone has eight mandatory ones.
The node reads them live from `GET /integration-settings/:id` and renders them
as real fields, so they stay in step with the app without a release here.

### Attaching media

Chain an **Upload File** (or **Upload File From URL**) node and pass its output
to the **Media** field. Both `id` and `path` are required on each entry — the
node refuses ids alone rather than scheduling a post without its image.

## Trigger

Pick the events and, optionally, the channels. On activation the node registers
a webhook on your account and stores the signing secret; on deactivation it
removes it.

Every delivery is an envelope:

```json
{
  "id": "4f2…",
  "event": "post.published",
  "occurredAt": "2026-09-22T10:00:00.000Z",
  "organizationId": "org_…",
  "data": { }
}
```

and is signed. `X-Nadia-Signature` is `sha256=` plus the HMAC of
`<X-Nadia-Timestamp>.<raw body>`. The node checks it by default; turn
**Verify Signature** off only if you put something in front of n8n that
rewrites the body.

## Development

```bash
pnpm install --ignore-workspace
pnpm build
pnpm lint
pnpm test
```

Inside the Nadia monorepo, two more checks run from the repository root:
`node scripts/n8n-scan.mjs` (n8n's official community-package scanner, run on
the packed tarball before it is published) and
`node scripts/check-n8n-contract.mjs` (every endpoint this node calls still
exists in the API).

`lint` sets `ESLINT_USE_FLAT_CONFIG=false`: this package keeps an `.eslintrc.js`
while the repository around it uses flat config, and ESLint 8 otherwise walks up
and finds the wrong one.

## Licence

MIT. Derived in part from
[`n8n-nodes-postiz`](https://github.com/gitroomhq/postiz-n8n) (MIT).
