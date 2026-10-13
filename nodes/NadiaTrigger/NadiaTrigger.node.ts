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
import { NodeOperationError } from 'n8n-workflow';
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
		description: 'Starts the workflow when Nadia publishes a post or receives a comment or a DM',
		defaults: {
			name: 'Nadia Trigger',
		},
		inputs: [],
		outputs: ['main'],
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
						name: 'Post Published',
						value: 'post.published',
						description: 'A post was published on a channel',
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
						name: 'Automation Triggered',
						value: 'automation.triggered',
						description: 'A comment matched a comment-automation rule and the reply was sent',
					},
					{
						name: 'Email Captured',
						value: 'automation.email_captured',
						description:
							'An automation recorded the email address of the person it is talking to',
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
				} catch {
					// Already gone on the Nadia side — nothing to clean up.
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
				throw new NodeOperationError(
					this.getNode(),
					'Delivery is missing its Nadia signature headers',
				);
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
				throw new NodeOperationError(this.getNode(), 'Nadia signature does not match');
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
