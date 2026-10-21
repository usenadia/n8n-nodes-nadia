import { createHmac } from 'crypto';
import { NadiaTrigger } from '../nodes/NadiaTrigger/NadiaTrigger.node';

const node = new NadiaTrigger();

const SECRET = 'whsec_test';

const sign = (timestamp: string, body: unknown) =>
	`sha256=${createHmac('sha256', SECRET)
		.update(`${timestamp}.${JSON.stringify(body)}`)
		.digest('hex')}`;

describe('NadiaTrigger description', () => {
	it('is a trigger with no input and one webhook', () => {
		expect(node.description.group).toEqual(['trigger']);
		expect(node.description.inputs).toEqual([]);
		expect(node.description.webhooks).toHaveLength(1);
	});

	it('offers every event the backend emits', () => {
		const events = node.description.properties.find((p) => p.name === 'events');
		// Listed alphabetically by label, as the n8n linter requires.
		expect((events?.options as Array<{ value: string }>).map((o) => o.value).sort()).toEqual([
			'automation.email_captured',
			'automation.triggered',
			'comment.received',
			'dm.received',
			'post.published',
		]);
	});
});

describe('webhookMethods', () => {
	const makeHook = (overrides: Record<string, unknown> = {}) => {
		const staticData: Record<string, unknown> = (overrides.staticData as never) ?? {};
		const httpRequestWithAuthentication = jest
			.fn()
			.mockResolvedValue({ id: 'wh-1', secret: SECRET });
		return {
			staticData,
			httpRequestWithAuthentication,
			context: {
				getCredentials: jest.fn().mockResolvedValue({ apiKey: 'k', host: 'https://h/api' }),
				getWorkflowStaticData: () => staticData,
				getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc',
				getWorkflow: () => ({ name: 'My flow' }),
				getNodeParameter: (name: string, fallback?: unknown) =>
					name === 'events' ? ['post.published'] : (fallback ?? []),
				helpers: { httpRequestWithAuthentication },
				getNode: () => ({ name: 'Nadia Trigger' }),
				...overrides,
			},
		};
	};

	// The whole point of the backend work: the trigger registers its own URL.
	it('registers the webhook and stores its ID and secret', async () => {
		const { context, staticData, httpRequestWithAuthentication } = makeHook();

		await node.webhookMethods.default.create.call(context as never);

		const [, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(options.method).toBe('POST');
		expect(options.url).toBe('https://h/api/public/v1/webhooks');
		expect(options.body).toMatchObject({
			url: 'https://n8n.example.com/webhook/abc',
			events: ['post.published'],
		});
		expect(staticData).toEqual({ webhookId: 'wh-1', secret: SECRET });
	});

	it('reports missing when nothing was registered yet', async () => {
		const { context } = makeHook();
		await expect(node.webhookMethods.default.checkExists.call(context as never)).resolves.toBe(
			false,
		);
	});

	// A webhook deleted from the Nadia UI must come back as missing, not as a
	// duplicate registration.
	it('forgets a webhook the API no longer knows', async () => {
		const staticData: Record<string, unknown> = { webhookId: 'gone', secret: SECRET };
		const { context } = makeHook({
			staticData,
			helpers: {
				httpRequestWithAuthentication: jest.fn().mockRejectedValue(new Error('404')),
			},
		});

		await expect(node.webhookMethods.default.checkExists.call(context as never)).resolves.toBe(
			false,
		);
		expect(staticData.webhookId).toBeUndefined();
		expect(staticData.secret).toBeUndefined();
	});

	it('deletes the webhook on deactivation', async () => {
		const staticData: Record<string, unknown> = { webhookId: 'wh-1', secret: SECRET };
		const { context, httpRequestWithAuthentication } = makeHook({ staticData });

		await node.webhookMethods.default.delete.call(context as never);

		expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
			method: 'DELETE',
			url: 'https://h/api/public/v1/webhooks/wh-1',
		});
		expect(staticData).toEqual({});
	});
});

describe('webhook()', () => {
	const makeWebhook = (body: unknown, headers: Record<string, string>, verify = true) => ({
		getRequestObject: () => ({}),
		getHeaderData: () => headers,
		getBodyData: () => body,
		getNodeParameter: (name: string, fallback?: unknown) => {
			if (name === 'verifySignature') return verify;
			if (name === 'events') return ['post.published'];
			return fallback;
		},
		getWorkflowStaticData: () => ({ secret: SECRET }),
		helpers: { returnJsonArray: (d: unknown) => [{ json: d }] },
		getNode: () => ({ name: 'Nadia Trigger' }),
		getResponseObject: () => response,
	});

	const response = { status: jest.fn(), json: jest.fn() };
	beforeEach(() => {
		response.status.mockReset().mockReturnValue(response);
		response.json.mockReset();
	});

	const body = { id: 'd1', event: 'post.published', data: { id: 'post-1' } };

	it('accepts a correctly signed delivery', async () => {
		const timestamp = '1700000000';
		const context = makeWebhook(body, {
			'x-nadia-signature': sign(timestamp, body),
			'x-nadia-timestamp': timestamp,
		});

		const result = await node.webhook.call(context as never);

		expect(result.workflowData).toEqual([[{ json: body }]]);
	});

	it('rejects a forged signature', async () => {
		const context = makeWebhook(body, {
			'x-nadia-signature': 'sha256=deadbeef',
			'x-nadia-timestamp': '1700000000',
		});

		// Answered by the node, not thrown: a 500 would be retried by Nadia.
		await expect(node.webhook.call(context as never)).resolves.toEqual({ noWebhookResponse: true });
		expect(response.status).toHaveBeenCalledWith(401);
		expect(response.json).toHaveBeenCalledWith({ error: 'Nadia signature does not match' });
	});

	it('rejects a delivery with no signature headers', async () => {
		const context = makeWebhook(body, {});
		await expect(node.webhook.call(context as never)).resolves.toEqual({ noWebhookResponse: true });
		expect(response.status).toHaveBeenCalledWith(400);
		expect(response.json).toHaveBeenCalledWith({
			error: 'Delivery is missing its Nadia signature headers',
		});
	});

	it('lets an unsigned delivery through when verification is off', async () => {
		const context = makeWebhook(body, {}, false);
		const result = await node.webhook.call(context as never);
		expect(result.workflowData).toEqual([[{ json: body }]]);
	});

	it('drops an event the node did not subscribe to', async () => {
		const other = { id: 'd2', event: 'dm.received', data: {} };
		const timestamp = '1700000000';
		const context = makeWebhook(other, {
			'x-nadia-signature': sign(timestamp, other),
			'x-nadia-timestamp': timestamp,
		});

		const result = await node.webhook.call(context as never);

		expect(result.workflowData).toEqual([]);
	});
});
