import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'crypto';

import { nadiaApiRequest, type NadiaChannel } from '../Nadia/GenericFunctions';

export class NadiaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nadia Trigger',
		name: 'nadiaTrigger',
		icon: 'file:nadia.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		// n8n's node search merges Nadia and Nadia Trigger into one entry and shows
		// this description for both, so it names what the action node does too.
		description:
			'Schedule social posts with Nadia, and start workflows when it publishes a post or receives a comment or a DM',
		defaults: {
			name: 'Nadia Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'nadiaApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['post.published'],
				description: 'The events this trigger subscribes to',
				options: [
					{
						name: 'Automation Triggered',
						value: 'automation.triggered',
						description: 'A comment matched an automation and the reply was sent',
					},
					{
						name: 'Comment Received',
						value: 'comment.received',
						description: 'A comment was received on a post of a connected channel',
					},
					{
						name: 'DM Received',
						value: 'dm.received',
						description: 'A direct message was received on a connected channel',
					},
					{
						name: 'Email Captured',
						value: 'automation.email_captured',
						description:
							'An automation recorded the email address of the person it is talking to',
					},
					{
						name: 'Post Published',
						value: 'post.published',
						description: 'A post was published on a channel',
					},
				],
			},
			{
				displayName: 'Channel Names or IDs',
				name: 'channelIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
				},
				default: [],
				description:
					'Only fire for these channels. Leave empty for all of them. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description:
					'Whether to reject deliveries whose X-Nadia-Signature does not match the secret handed out when this trigger registered itself',
			},
		],
	};

	methods = {
		loadOptions: {
			async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channels: NadiaChannel[] = await nadiaApiRequest.call(this, 'GET', '/integrations');
				return (channels || []).map((channel) => ({
					name: `${channel.name} (${channel.identifier})`,
					value: channel.id,
				}));
			},
		},
	};

	webhookMethods = {
		default: {
			// n8n asks this on activation and whenever it repairs a workflow. A
			// webhook deleted from the Nadia UI must come back as « missing », not
			// as a duplicate registration.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.webhookId) {
					return false;
				}

				try {
					await nadiaApiRequest.call(this, 'GET', `/webhooks/${webhookData.webhookId}`);
					return true;
				} catch {
					delete webhookData.webhookId;
					delete webhookData.secret;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const channelIds = (this.getNodeParameter('channelIds', []) as string[]) || [];
				const workflowName = this.getWorkflow().name || 'workflow';

				const body: IDataObject = {
					name: `n8n — ${workflowName}`,
					url: webhookUrl,
					events,
					integrations: channelIds.map((id) => ({ id })),
				};

				const response = await nadiaApiRequest.call(this, 'POST', '/webhooks', body);

				if (!response?.id) {
					throw new NodeOperationError(
						this.getNode(),
						'Nadia did not return a webhook ID — the trigger was not registered',
					);
				}

				const webhookData = this.getWorkflowStaticData('node');
				webhookData.webhookId = response.id;
				// Returned once, on creation. Without it the node cannot verify
				// signatures, so `verifySignature` has to be turned off by hand.
				webhookData.secret = response.secret;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.webhookId) {
					return true;
				}

				try {
					await nadiaApiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);
				} catch (error) {
					// Already gone on the Nadia side (deleted from the app) — nothing to
					// clean up, but say so rather than swallow it.
					this.logger.debug('Nadia webhook already removed', {
						webhookId: webhookData.webhookId,
						error: (error as Error).message,
					});
				}

				delete webhookData.webhookId;
				delete webhookData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, string>;
		const body = this.getBodyData() as IDataObject;
		const verify = this.getNodeParameter('verifySignature', true) as boolean;
		const webhookData = this.getWorkflowStaticData('node');
		const secret = webhookData.secret as string | undefined;

		if (verify && secret) {
			const signature = headers['x-nadia-signature'];
			const timestamp = headers['x-nadia-timestamp'];

			if (!signature || !timestamp) {
				return refuse.call(this, 400, 'Delivery is missing its Nadia signature headers');
			}

			// The raw body is what was signed; JSON.stringify of the parsed body is
			// byte-identical for what Nadia sends, and rawBody is used when n8n
			// kept it.
			const raw =
				(request as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
				JSON.stringify(body);
			const expected = `sha256=${createHmac('sha256', secret)
				.update(`${timestamp}.${raw}`)
				.digest('hex')}`;

			const a = Buffer.from(expected);
			const b = Buffer.from(signature);
			if (a.length !== b.length || !timingSafeEqual(a, b)) {
				return refuse.call(this, 401, 'Nadia signature does not match');
			}
		}

		// Nadia filters by event server-side, but a webhook row edited in the app
		// could widen the list — keep the node honest about what it asked for.
		const wanted = this.getNodeParameter('events') as string[];
		if (body.event && wanted.length && !wanted.includes(body.event as string)) {
			return { noWebhookResponse: false, workflowData: [] };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}

/**
 * Answer a refused delivery with a 4xx and start nothing. Throwing would make
 * n8n answer 500, and Nadia retries a 5xx three times although the signature
 * will not change; a 4xx (other than 429) is not retried.
 */
function refuse(this: IWebhookFunctions, status: 400 | 401, error: string): IWebhookResponseData {
	this.logger?.debug(`Nadia Trigger refused a delivery: ${error}`);
	this.getResponseObject().status(status).json({ error });
	return { noWebhookResponse: true };
}
