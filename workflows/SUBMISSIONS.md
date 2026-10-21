# Template submissions

Ready to paste into the n8n Creator Portal (<https://creators.n8n.io>), one
template at a time. For each one: the **title** goes in the title field, the
**description** block goes in the description field as is, and the workflow
JSON is the file next to this one.

The description opens with a screenshot of the canvas because n8n.io cannot
render community nodes in its workflow preview. The image URL points at the
public mirror; it resolves once `images/<name>.png` is committed here and the
next `n8n-v*` tag has pushed it there. Uploading the image in the portal's
editor instead works just as well: replace the URL with the one it gives.

---

## 1. RSS to scheduled post

**File** `rss-to-scheduled-post.json`

**Title** Schedule social posts from an RSS feed with AI captions in Nadia

**Description**

```markdown
![Workflow](https://raw.githubusercontent.com/usenadia/n8n-nodes-nadia/main/workflows/images/rss-to-scheduled-post.png)

> **Self-hosted n8n only.** This template uses the `n8n-nodes-nadia` community node, which n8n has not verified yet. Install it first: Settings -> Community Nodes -> Install -> `n8n-nodes-nadia`.

## Who is this for

Blogs, newsletters and media sites that want every new article on their social accounts without writing each post by hand.

## What it does

Every hour the workflow reads your RSS feed, keeps only the items published since the last run, asks an AI model for a short caption, and schedules each post on a Nadia channel (Instagram, TikTok or any network you connect) in the next free slot of that channel's posting schedule. Ten articles at once do not become ten posts in ten minutes: Nadia spreads them over your slots.

## How it works

1. A Schedule Trigger fires every hour.
2. A Set node holds the feed URL, and RSS Read fetches the feed.
3. A Filter drops items older than one hour, so nothing is posted twice.
4. A Basic LLM Chain writes the caption from the title and summary.
5. The Nadia node creates the post with Use Next Free Slot turned on.

## Setup

1. Create a Nadia credential: API key from Settings -> Developers, host `https://app.usenadia.com/api`.
2. Put your feed URL in **Your settings**.
3. Add an OpenAI credential to **Caption model**, or swap in any chat model.
4. In **Schedule the post**, pick your channel, then close and reopen the node: its settings load at that moment. Fill them.

## Requirements

A Nadia account with at least one connected channel, and an OpenAI (or other LLM) API key.
```

---

## 2. Published post to Slack

**File** `published-post-to-slack.json`

**Title** Send a Slack message for every post Nadia publishes

**Description**

```markdown
![Workflow](https://raw.githubusercontent.com/usenadia/n8n-nodes-nadia/main/workflows/images/published-post-to-slack.png)

> **Self-hosted n8n only.** This template uses the `n8n-nodes-nadia` community node, which n8n has not verified yet. Install it first: Settings -> Community Nodes -> Install -> `n8n-nodes-nadia`.

## Who is this for

Social media teams and agencies who schedule posts in Nadia and want the rest of the team to see each one the moment it goes live.

## What it does

Scheduled posts go out while nobody is watching. This workflow turns every publication into one Slack message with the channel name, the text of the post and a link to it on the network, so the team knows what the account said without opening another app.

## How it works

1. The Nadia Trigger receives a signed `post.published` event. It registers its own webhook in Nadia when you activate the workflow and removes it when you deactivate it, and it checks the signature of every delivery.
2. A Set node flattens the event into the three fields the message needs, and turns the HTML of the post into plain text.
3. The Slack node posts the message to the channel you pick.

## Setup

1. Create a Nadia credential: API key from Settings -> Developers, host `https://app.usenadia.com/api`.
2. Add a Slack credential to **Post to Slack** and choose a channel.
3. Activate the workflow. n8n must be reachable from the internet over HTTPS, since Nadia refuses private webhook URLs.

## Customize

Pick channels on the trigger to follow only some accounts, or add the `automation.triggered` event to hear about comment automations too.
```

---

## 3. DM to Google Sheets

**File** `dm-to-google-sheets.json`

**Title** Log Instagram DMs from Nadia to Google Sheets

**Description**

```markdown
![Workflow](https://raw.githubusercontent.com/usenadia/n8n-nodes-nadia/main/workflows/images/dm-to-google-sheets.png)

> **Self-hosted n8n only.** This template uses the `n8n-nodes-nadia` community node, which n8n has not verified yet. Install it first: Settings -> Community Nodes -> Install -> `n8n-nodes-nadia`.

## Who is this for

Creators and small businesses who get leads, questions and story replies in their Instagram DMs and lose track of them as the account grows.

## What it does

Every direct message your connected Instagram account receives becomes one row in a Google Sheet: when it arrived, on which channel, who wrote it and what they said. The sheet becomes a searchable log you can share, filter or feed into a CRM.

To map the fields before a real DM arrives, `POST /public/v1/webhooks/{id}/test` sends a sample delivery.

## How it works

1. The Nadia Trigger receives a signed `dm.received` event. It registers its own webhook in Nadia on activation, so nothing has to be configured in the app.
2. A Set node flattens the event into one flat row.
3. The Google Sheets node appends the row to your sheet.

## Setup

1. Create a Nadia credential: API key from Settings -> Developers, host `https://app.usenadia.com/api`.
2. Create a sheet with the columns `date`, `channelId`, `username`, `message`.
3. Add a Google Sheets credential to **Append the row** and pick the spreadsheet and tab.
4. Activate the workflow. n8n must be reachable from the internet over HTTPS.

## Customize

Add the `comment.received` event to log public comments in the same sheet, with an IF node to route them to their own tab.
```

---

## 4. TemplateFox image to post

**File** `templatefox-image-to-post.json`

**Title** Schedule image posts from Google Sheets rows with TemplateFox and Nadia

**Description**

```markdown
![Workflow](https://raw.githubusercontent.com/usenadia/n8n-nodes-nadia/main/workflows/images/templatefox-image-to-post.png)

> **Self-hosted n8n only.** This template uses the `n8n-nodes-nadia` community node, which n8n has not verified yet. Install it first: Settings -> Community Nodes -> Install -> `n8n-nodes-nadia`.

## Who is this for

Anyone who publishes the same kind of visual again and again: listings, quotes, offers, statistics, event announcements. You keep the data in a spreadsheet, the design in a template.

## What it does

Once a day the workflow reads the rows of a Google Sheet still marked as not posted, renders each one into a designed image with a TemplateFox template, and schedules it on a Nadia channel in the next free slot, with the caption from the same row. Nadia fetches the image from its URL, so no file travels through n8n.

## How it works

1. A Schedule Trigger runs every morning, and a Set node holds the template id.
2. Google Sheets returns the rows whose `posted` column is `no`.
3. An HTTP Request sends each row to the TemplateFox image API and gets an image URL back.
4. Nadia uploads the image from that URL into its media library.
5. Nadia schedules the post in the next free slot with the image attached.

## Setup

1. Create a Nadia credential: API key from Settings -> Developers, host `https://app.usenadia.com/api`.
2. Create a Header Auth credential named `x-api-key` with your TemplateFox API key.
3. Put your template id in **Your settings**.
4. Point **Read rows to post** at a sheet with `caption`, `posted` and one column per template field.
5. In **Schedule the post**, pick your channel, then close and reopen the node: its settings load at that moment. Fill them.
```
