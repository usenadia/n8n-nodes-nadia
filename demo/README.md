# n8n demo environment

Local n8n for testing the Nadia node and recording the verification video.

## Requirements

Docker.

## Commands

| Command | What it does |
|---|---|
| `./start.sh` | start n8n on http://localhost:5678 |
| `./stop.sh` | stop it, keeping the data |
| `./reset.sh` | stop it and delete the data |
| `./link.sh` | build this package and install **that** build into the running n8n |

Use `link.sh` while developing; install `n8n-nodes-nadia` from Settings →
Community Nodes when you want the published one.

## Testing the Trigger node

The Trigger registers a webhook on your Nadia account, and Nadia has to be able
to reach it. `localhost:5678` is not reachable from the server, so expose n8n
through a tunnel and set `WEBHOOK_URL` in `docker-compose.yml` to the public
URL before starting.

The API also refuses private and non-HTTPS webhook URLs (`IsSafeWebhookUrl`),
so a tunnel is required, not optional.

## Verification video

n8n asks for an uncut recording showing:

1. installing `n8n-nodes-nadia` from Settings → Community Nodes
2. adding the credential (API key + host) and testing it
3. one action — Create Post, with the channel dropdown and the provider settings
4. the node used as a tool by an AI Agent
5. the Trigger node firing on a real publication
