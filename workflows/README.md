# Workflow templates

Ready-to-import n8n workflows built on the `n8n-nodes-nadia` community node.
They are also what we submit to the [n8n template library](https://n8n.io/workflows/)
— each listing is a page someone else maintains that links back to us
(the reasoning is TemplateFox's `integration-backlink-strategy.md`).

| Workflow | File | What it does |
|---|---|---|
| RSS to scheduled post | `rss-to-scheduled-post.json` | Hourly feed read → AI caption → post scheduled in the next free slot |
| Published post to Slack | `published-post-to-slack.json` | **Trigger** on `post.published` → one Slack message per publication |
| DM to Google Sheets | `dm-to-google-sheets.json` | **Trigger** on `dm.received` → one row per inbound DM |
| TemplateFox image to post | `templatefox-image-to-post.json` | Sheet row → TemplateFox render → upload → scheduled post |

The last one is the maltaexpat pipeline made public: it is the same
data → TemplateFox → Nadia chain, with a spreadsheet standing in for the
maltaexpat dataset.

## Importing one

Workflows → **Import from File** → pick the `.json` → then:

1. add the **Nadia** credential (API key from Settings → Developers, host
   `https://app.usenadia.com/api`),
2. open the Nadia node and pick your channel from the dropdown — the
   provider settings load from the API right after,
3. add the other credentials the workflow uses (Slack, Google, the model).

A workflow built on **Nadia Trigger** registers its webhook when you activate
it, so activate it last. n8n has to be reachable from the internet over HTTPS;
the API refuses private and non-HTTPS webhook URLs.

## Conventions

`node scripts/check-n8n-workflows.mjs` (run in CI) enforces what n8n checks at
submission: exactly one yellow overview sticky of 100–300 words containing
`### How it works` and `### Setup`, white (`color: 7`) section stickies under
50 words, no overlapping nodes, no placeholder text, and every connection
pointing at a node that exists.

## Published on n8n.io

| Workflow | Link |
|---|---|
| RSS to scheduled post | _pending submission_ |
| Published post to Slack | _pending submission_ |
| DM to Google Sheets | _pending submission_ |
| TemplateFox image to post | _pending submission_ |
