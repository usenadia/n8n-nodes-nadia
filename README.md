# n8n-nodes-nadia

n8n community node for [Nadia](https://usenadia.com) — schedule social posts,
upload media, read analytics, and start a workflow when a post is published or
a comment or DM comes in.

Two nodes ship in this package:

| Node | What it does |
|---|---|
| **Nadia** | actions — create posts, upload media, list channels, read analytics. Also available to the AI Agent as a tool. |
| **Nadia Trigger** | starts a workflow on `post.published`, `comment.received`, `dm.received`, `automation.triggered` or `automation.email_captured`. It registers its own webhook, so there is nothing to set up in the app. |

## Installation

On a self-hosted n8n: Settings → **Community Nodes** → **Install** →
`n8n-nodes-nadia`. See n8n's
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/).

## Compatibility

Built and tested against n8n 2.x (`n8n-workflow` 2.x). Requires Node.js 20.15
or later.

## Authentication

The node authenticates with a Nadia API key, sent in the `Authorization`
header of every call to the public API (`/public/v1`).

1. In Nadia, open **Settings → Developers** and copy your API key.
2. In n8n, create a **Nadia API** credential and fill in:

| Field | Notes |
|---|---|
| **API Key** | The key from Settings → Developers. An OAuth token (`pos_…`) works too. |
| **Host** | `https://app.usenadia.com/api` for the hosted app. |

Saving the credential calls `GET /public/v1/is-connected`, so a wrong key or
host fails right away.

> **Self-hosting?** The API lives behind `/api`, so the host must end with it —
> `https://social.example.com/api`, not `https://social.example.com`. This is
> the single most common setup mistake.

## Usage

**Schedule a post.** Add a **Nadia** node, choose **Create Post**, pick a
**Channel** from the dropdown, write the **Content**, and either set a date or
turn on **Use Next Free Slot** to let Nadia book the next open slot of that
channel's posting schedule. The channel's own settings (TikTok privacy, Instagram
post type…) appear below once the channel is picked.

**Post with an image.** Put an **Upload File From URL** (or **Upload File**,
for binary data from a previous node) before **Create Post**, and pass its
output to **Media**:

```
{{ JSON.stringify([{ id: $json.id, path: $json.path }]) }}
```

**React to what happens on your accounts.** Add a **Nadia Trigger**, tick the
events you want, and activate the workflow. Each delivery is one item: the
envelope described under [Trigger](#trigger), with the event payload in
`$json.data`.

**Let an AI Agent post for you.** The **Nadia** node is usable as a tool: attach
it to an **AI Agent** node and the agent can list channels, find a free slot and
schedule posts.

## Example workflows

Four ready-to-import workflows live in the
[`workflows/`](https://github.com/usenadia/n8n-nodes-nadia/tree/main/workflows)
folder of the repository (Workflows → **Import from File**):

| Workflow | What it does |
|---|---|
| [Schedule social posts from an RSS feed with AI captions](https://github.com/usenadia/n8n-nodes-nadia/blob/main/workflows/rss-to-scheduled-post.json) | hourly feed read → AI caption → post scheduled in the next free slot |
| [Send a Slack message for every post Nadia publishes](https://github.com/usenadia/n8n-nodes-nadia/blob/main/workflows/published-post-to-slack.json) | **Nadia Trigger** on `post.published` → one Slack message per publication |
| [Log Instagram DMs from Nadia to Google Sheets](https://github.com/usenadia/n8n-nodes-nadia/blob/main/workflows/dm-to-google-sheets.json) | **Nadia Trigger** on `dm.received` → one row per inbound DM |
| [Schedule image posts from Google Sheets rows with TemplateFox](https://github.com/usenadia/n8n-nodes-nadia/blob/main/workflows/templatefox-image-to-post.json) | sheet row → TemplateFox render → upload → scheduled post |

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
| Create Card | `POST /contents` |
| Get Cards | `GET /contents` (filtered by column in the node) |
| Move Card | `PUT /contents/:id/move` |
| Update Card | `PUT /contents/:id` |

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

`lint` is n8n's own `n8n-node lint` (from `@n8n/node-cli`), in strict mode:
`eslint.config.mjs` must stay the default one it generates.

## Resources

- [Nadia n8n node documentation](https://usenadia.com/docs/integrations/n8n)
- [Nadia public API documentation](https://usenadia.com/docs/public-api/introduction)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Licence

MIT. Derived in part from upstream's n8n node (MIT).
