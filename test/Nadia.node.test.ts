import { Nadia } from '../nodes/Nadia/Nadia.node';
import { NadiaApi } from '../credentials/NadiaApi.credentials';

const node = new Nadia();

describe('Nadia node description', () => {
	it('is usable as an AI Agent tool', () => {
		expect(node.description.usableAsTool).toBe(true);
	});

	it('requires the nadiaApi credential', () => {
		expect(node.description.credentials).toEqual([{ name: 'nadiaApi', required: true }]);
	});

	it('gives every parameter a default', () => {
		for (const property of node.description.properties) {
			expect(property).toHaveProperty('default');
		}
	});

	it('exposes the operations the plan promises', () => {
		const operation = node.description.properties.find((p) => p.name === 'operation');
		const values = (operation?.options as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(
			expect.arrayContaining([
				'createPost',
				'deletePost',
				'findFreeSlot',
				'getAnalytics',
				'getBrands',
				'getChannels',
				'getChannelSettings',
				'getPosts',
				'uploadFile',
				'uploadFromUrl',
			]),
		);
	});

	// Upstream's node makes you paste a channel UUID by hand. The dropdown is
	// the single biggest reason this package exists.
	it('loads channels and brands from the API', () => {
		expect(Object.keys(node.methods.loadOptions)).toEqual(
			expect.arrayContaining(['getChannels', 'getBrands']),
		);
	});

	it('maps provider settings instead of asking for free-form key/value', () => {
		const settings = node.description.properties.find((p) => p.name === 'settings');
		expect(settings?.type).toBe('resourceMapper');
		expect(Object.keys(node.methods.resourceMapping)).toContain('getChannelSettingsMapping');
	});

	it('narrows the channel list by brand', () => {
		const channel = node.description.properties.find((p) => p.name === 'channelId');
		expect(channel?.typeOptions?.loadOptionsDependsOn).toEqual(['brandId']);
	});
});

describe('getChannels', () => {
	const makeContext = (channels: unknown[], brandId = '') => {
		const httpRequestWithAuthentication = jest.fn().mockResolvedValue(channels);
		return {
			context: {
				getCredentials: jest.fn().mockResolvedValue({ apiKey: 'k', host: 'https://h/api' }),
				getCurrentNodeParameter: jest.fn().mockReturnValue(brandId),
				helpers: { httpRequestWithAuthentication },
				getNode: () => ({ name: 'Nadia' }),
			},
			httpRequestWithAuthentication,
		};
	};

	it('hides disabled channels and labels them with their provider', async () => {
		const { context } = makeContext([
			{ id: '1', name: 'Malta Expat', identifier: 'instagram-standalone' },
			{ id: '2', name: 'Broken', identifier: 'tiktok', disabled: true },
		]);

		const options = await node.methods.loadOptions.getChannels.call(context as never);

		expect(options).toEqual([{ name: 'Malta Expat (instagram-standalone)', value: '1' }]);
	});

	it('passes the brand as the group filter', async () => {
		const { context, httpRequestWithAuthentication } = makeContext([], 'brand-1');

		await node.methods.loadOptions.getChannels.call(context as never);

		expect(httpRequestWithAuthentication.mock.calls[0][1].qs).toEqual({ group: 'brand-1' });
	});
});

describe('getChannelSettingsMapping', () => {
	const makeContext = (settings: unknown, channelId = 'chan-1') => ({
		getCredentials: jest.fn().mockResolvedValue({ apiKey: 'k', host: 'https://h/api' }),
		getCurrentNodeParameter: jest.fn().mockReturnValue(channelId),
		helpers: {
			httpRequestWithAuthentication: jest.fn().mockResolvedValue({ output: { settings } }),
		},
		getNode: () => ({ name: 'Nadia' }),
	});

	it('turns the provider JSON Schema into resource mapper fields', async () => {
		const context = makeContext({
			type: 'object',
			required: ['privacy_level'],
			properties: {
				privacy_level: { type: 'string', enum: ['PUBLIC', 'PRIVATE'], title: 'Privacy Level' },
				disclose: { type: 'boolean' },
			},
		});

		const { fields } = await node.methods.resourceMapping.getChannelSettingsMapping.call(
			context as never,
		);

		expect(fields).toEqual([
			expect.objectContaining({
				id: 'privacy_level',
				displayName: 'Privacy Level',
				required: true,
				type: 'string',
				options: [
					{ name: 'PUBLIC', value: 'PUBLIC' },
					{ name: 'PRIVATE', value: 'PRIVATE' },
				],
			}),
			expect.objectContaining({ id: 'disclose', required: false, type: 'boolean' }),
		]);
		// A property with no `title` in the schema still gets a usable label.
		expect(fields.find((f) => f.id === 'disclose')?.displayName).toBe('disclose');
	});

	// Providers with nothing to configure answer with a sentence, not a schema.
	it('returns no field when the provider needs no settings', async () => {
		const context = makeContext('No additional settings required');
		const { fields } = await node.methods.resourceMapping.getChannelSettingsMapping.call(
			context as never,
		);
		expect(fields).toEqual([]);
	});

	it('returns no field before a channel is picked', async () => {
		const context = makeContext({}, '');
		const { fields } = await node.methods.resourceMapping.getChannelSettingsMapping.call(
			context as never,
		);
		expect(fields).toEqual([]);
	});
});

describe('NadiaApi credential', () => {
	const credential = new NadiaApi();

	it('sends the key raw, not as a Bearer token', () => {
		expect(credential.authenticate.properties.headers).toEqual({
			Authorization: '={{$credentials.apiKey}}',
		});
	});

	it('defaults the host to the hosted app, with the /api suffix', () => {
		const host = credential.properties.find((p) => p.name === 'host');
		expect(host?.default).toBe('https://app.usenadia.com/api');
		expect(host?.required).toBe(true);
	});

	it('tests the credential against a real endpoint', () => {
		expect(credential.test.request.url).toBe('/public/v1/is-connected');
	});

	// n8n renders credential descriptions as HTML, not Markdown.
	it('uses HTML links in descriptions', () => {
		for (const property of credential.properties) {
			expect(property.description).not.toMatch(/\[.+\]\(.+\)/);
		}
	});
});
