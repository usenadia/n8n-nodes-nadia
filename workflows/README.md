# Workflow templates

Ready-to-import n8n workflows built on the `n8n-nodes-nadia` community node.
They are also what we submit to the [n8n template library](https://n8n.io/workflows/)
— each listing is a page someone else maintains that links back to us
(the reasoning is TemplateFox's `integration-backlink-strategy.md`).

| Workflow | File | What it does |
|---|---|---|
| Schedule social posts from an RSS feed with AI captions in Nadia | `rss-to-scheduled-post.json` | Hourly feed read → AI caption → post scheduled in the next free slot |
| Send a Slack message for every post Nadia publishes | `published-post-to-slack.json` | **Trigger** on `post.published` → one Slack message per publication |
| Log Instagram DMs from Nadia to Google Sheets | `dm-to-google-sheets.json` | **Trigger** on `dm.received` → one row per inbound DM |
| Schedule image posts from Google Sheets rows with TemplateFox and Nadia | `templatefox-image-to-post.json` | Sheet row → TemplateFox render → upload → scheduled post |

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
pointing at a node that exists. It also checks the rules for templates built on
a community node and the hygiene n8n asks of every template:

- the overview sticky carries the **"Self-hosted n8n only"** disclaimer (the
  node is not verified yet, so n8n Cloud cannot install it);
- no node keeps its default name (`Google Sheets`, `Nadia`, `HTTP Request`…);
- no `webhookId` (a fixed one collides between two imports), no API key typed
  into an HTTP header (use a credential), no picked spreadsheet, Slack channel
  or Nadia channel, no e-mail address.

Values the user has to fill go in a **Set** node named `Your settings` when
there is more than a picker to set (feed URL, template id).

### Images

n8n.io cannot draw community nodes in its workflow preview, so every
description opens with a screenshot of the canvas. One PNG per template, named
after it: `images/<template>.png` (for example
`images/rss-to-scheduled-post.png`), a capture of the whole canvas at
1600 px wide or more. The PNGs are not part of the npm package (`files` is
`dist`, and the build copies icons from `nodes/` and `credentials/` only).

## Submitting to n8n.io

1. Create a creator account on <https://creators.n8n.io/register> (once).
2. Import the template in a self-hosted n8n with the node installed, check it
   runs, and take the screenshot (see *Images*).
3. In the Creator Portal, submit **one template at a time**: an unverified
   creator only has one template in review, and the next one waits until it is
   accepted. Paste the title and the description from
   [`SUBMISSIONS.md`](SUBMISSIONS.md), then upload the JSON.
4. Once it is published, put its link in the table below.

## Published on n8n.io

| Workflow | Link |
|---|---|
| `rss-to-scheduled-post.json` | _pending submission_ |
| `published-post-to-slack.json` | _pending submission_ |
| `dm-to-google-sheets.json` | _pending submission_ |
| `templatefox-image-to-post.json` | _pending submission_ |
