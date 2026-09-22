import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	defaultDateRange,
	jsonSchemaTypeToFieldType,
	nadiaApiRequest,
	parseMedia,
	toPostHtml,
	toStringArray,
	type NadiaBrand,
	type NadiaChannel,
} from './GenericFunctions';

const POST_OPS = ['createPost'];

export class Nadia implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nadia',
		name: 'nadia',
		icon: 'file:nadia.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Schedule social posts, upload media and read analytics with Nadia',
		usableAsTool: true,
		defaults: {
			name: 'Nadia',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'nadiaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create Post',
						value: 'createPost',
						description: 'Schedule, draft or immediately publish a post on one channel',
						action: 'Create a post',
					},
					{
						name: 'Delete Post',
						value: 'deletePost',
						description: 'Delete a post by ID',
						action: 'Delete a post',
					},
					{
						name: 'Find Free Slot',
						value: 'findFreeSlot',
						description: 'Get the next free slot in a channel posting schedule',
						action: 'Find a free slot',
					},
					{
						name: 'Get Analytics',
						value: 'getAnalytics',
						description: 'Get the live analytics of one channel',
						action: 'Get analytics',
					},
					{
						name: 'Get Brands',
						value: 'getBrands',
						description: 'Get the list of brands (channel groups)',
						action: 'Get many brands',
					},
					{
						name: 'Get Channel Settings',
						value: 'getChannelSettings',
						description: 'Get the rules, max length and required settings of a channel provider',
						action: 'Get channel settings',
					},
					{
						name: 'Get Channels',
						value: 'getChannels',
						description: 'Get the list of connected channels',
						action: 'Get many channels',
					},
					{
						name: 'Get Posts',
						value: 'getPosts',
						description: 'Get the posts of a date range',
						action: 'Get many posts',
					},
					{
						name: 'Upload File',
						value: 'uploadFile',
						description: 'Upload a binary file from a previous node',
						action: 'Upload a file',
					},
					{
						name: 'Upload File From URL',
						value: 'uploadFromUrl',
						description: 'Let Nadia fetch a file from a public URL',
						action: 'Upload a file from a URL',
					},
				],
				default: 'createPost',
			},

			// ──────────────────────────────────────────────────────────────
			// Channel / brand selection
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Brand Name or ID',
				name: 'brandId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBrands',
				},
				default: '',
				description:
					'Narrow the channel list to one brand. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						operation: [...POST_OPS, 'getPosts'],
					},
				},
			},
			{
				displayName: 'Channel Name or ID',
				name: 'channelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
					loadOptionsDependsOn: ['brandId'],
				},
				required: true,
				default: '',
				description:
					'The channel to post on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						operation: [
							...POST_OPS,
							'findFreeSlot',
							'getAnalytics',
							'getChannelSettings',
						],
					},
				},
			},

			// ──────────────────────────────────────────────────────────────
			// Create Post
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Schedule', value: 'schedule', description: 'Publish at the given date' },
					{ name: 'Now', value: 'now', description: 'Publish as soon as possible' },
					{ name: 'Draft', value: 'draft', description: 'Save without publishing' },
				],
				default: 'schedule',
				description: 'Whether to schedule the post, publish it now, or keep it as a draft',
				displayOptions: {
					show: { operation: POST_OPS },
				},
			},
			{
				displayName: 'Use Next Free Slot',
				name: 'useFreeSlot',
				type: 'boolean',
				default: false,
				description:
					'Whether to ask Nadia for the next free slot of that channel instead of giving a date',
				displayOptions: {
					show: { operation: POST_OPS, type: ['schedule'] },
				},
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'dateTime',
				default: '',
				required: true,
				description: 'When to publish the post',
				displayOptions: {
					show: { operation: POST_OPS, type: ['schedule'], useFreeSlot: [false] },
				},
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '',
				required: true,
				description:
					'The post text. Plain text is wrapped in paragraphs; HTML is passed through and sanitized server-side.',
				displayOptions: {
					show: { operation: POST_OPS },
				},
			},
			{
				displayName: 'Media',
				name: 'media',
				type: 'json',
				default: '',
				description:
					'Media to attach, as returned by an Upload operation. Both `ID` and `path` are required on each entry.',
				displayOptions: {
					show: { operation: POST_OPS },
				},
			},
			{
				displayName: 'Channel Settings',
				name: 'settings',
				type: 'resourceMapper',
				noDataExpression: true,
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['channelId'],
					resourceMapper: {
						resourceMapperMethod: 'getChannelSettingsMapping',
						mode: 'add',
						fieldWords: { singular: 'setting', plural: 'settings' },
						addAllFields: true,
						multiKeyMatch: false,
					},
				},
				description:
					'Provider-specific settings, read live from the channel. TikTok for instance requires eight of them.',
				displayOptions: {
					show: { operation: POST_OPS },
				},
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: { operation: POST_OPS },
				},
				options: [
					{
						displayName: 'Group',
						name: 'group',
						type: 'string',
						default: '',
						description: 'Group ID to publish the same content on several channels at once',
					},
					{
						displayName: 'Shorten Links',
						name: 'shortLink',
						type: 'boolean',
						default: false,
						description: 'Whether to replace links with trackable short links',
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						description: 'Comma-separated tag labels to attach to the post',
					},
				],
			},

			// ──────────────────────────────────────────────────────────────
			// Get Posts
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Beginning of the window. Defaults to 30 days ago when left empty.',
				displayOptions: {
					show: { operation: ['getPosts'] },
				},
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'End of the window. Defaults to now when left empty.',
				displayOptions: {
					show: { operation: ['getPosts'] },
				},
			},
			{
				displayName: 'Channel Name or ID',
				name: 'postsChannelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
					loadOptionsDependsOn: ['brandId'],
				},
				default: '',
				description:
					'Only return posts of this channel. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: { operation: ['getPosts'] },
				},
			},

			// ──────────────────────────────────────────────────────────────
			// Delete Post
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				default: '',
				required: true,
				description: 'ID of the post to delete',
				displayOptions: {
					show: { operation: ['deletePost'] },
				},
			},

			// ──────────────────────────────────────────────────────────────
			// Upload
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the input binary field containing the file to upload',
				displayOptions: {
					show: { operation: ['uploadFile'] },
				},
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				required: true,
				description: 'Public URL of the file Nadia should fetch and store',
				displayOptions: {
					show: { operation: ['uploadFromUrl'] },
				},
			},

			// ──────────────────────────────────────────────────────────────
			// Analytics
			// ──────────────────────────────────────────────────────────────
			{
				displayName: 'Days',
				name: 'days',
				type: 'number',
				default: 30,
				description: 'How many days of analytics to ask for',
				displayOptions: {
					show: { operation: ['getAnalytics'] },
				},
			},
		],
	};

	methods = {
		loadOptions: {
			async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const brandId = this.getCurrentNodeParameter('brandId') as string;
				const channels: NadiaChannel[] = await nadiaApiRequest.call(
					this,
					'GET',
					'/integrations',
					undefined,
					brandId ? { group: brandId } : undefined,
				);

				return (channels || [])
					.filter((channel) => !channel.disabled)
					.map((channel) => ({
						name: channel.customer
							? `${channel.name} (${channel.identifier}) — ${channel.customer.name}`
							: `${channel.name} (${channel.identifier})`,
						value: channel.id,
					}));
			},

			async getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const brands: NadiaBrand[] = await nadiaApiRequest.call(this, 'GET', '/groups');
				return (brands || []).map((brand) => ({ name: brand.name, value: brand.id }));
			},
		},

		resourceMapping: {
			async getChannelSettingsMapping(
				this: ILoadOptionsFunctions,
			): Promise<ResourceMapperFields> {
				const channelId = this.getCurrentNodeParameter('channelId') as string;
				if (!channelId) {
					return { fields: [] };
				}

				const response = await nadiaApiRequest.call(
					this,
					'GET',
					`/integration-settings/${channelId}`,
				);

				const schema = response?.output?.settings;
				// A provider with nothing to configure answers with a sentence,
				// not a schema.
				if (!schema || typeof schema === 'string' || !schema.properties) {
					return { fields: [] };
				}

				const required: string[] = Array.isArray(schema.required) ? schema.required : [];

				const fields: ResourceMapperField[] = Object.entries(
					schema.properties as Record<string, any>,
				).map(([key, definition]) => ({
					id: key,
					displayName: definition?.title || key,
					required: required.includes(key),
					defaultMatch: false,
					display: true,
					canBeUsedToMatch: false,
					type: jsonSchemaTypeToFieldType(definition || {}),
					...(Array.isArray(definition?.enum)
						? { options: definition.enum.map((v: unknown) => ({ name: String(v), value: v as string })) }
						: {}),
				}));

				return { fields };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let responseData: IDataObject | IDataObject[] = {};

				if (operation === 'createPost') {
					responseData = await createPost.call(this, i);
				} else if (operation === 'deletePost') {
					const postId = this.getNodeParameter('postId', i) as string;
					responseData = await nadiaApiRequest.call(this, 'DELETE', `/posts/${postId}`);
				} else if (operation === 'findFreeSlot') {
					const channelId = this.getNodeParameter('channelId', i) as string;
					responseData = await nadiaApiRequest.call(this, 'GET', `/find-slot/${channelId}`);
				} else if (operation === 'getAnalytics') {
					const channelId = this.getNodeParameter('channelId', i) as string;
					const days = this.getNodeParameter('days', i, 30) as number;
					responseData = await nadiaApiRequest.call(
						this,
						'GET',
						`/analytics/${channelId}`,
						undefined,
						{ date: days },
					);
				} else if (operation === 'getBrands') {
					responseData = await nadiaApiRequest.call(this, 'GET', '/groups');
				} else if (operation === 'getChannels') {
					responseData = await nadiaApiRequest.call(this, 'GET', '/integrations');
				} else if (operation === 'getChannelSettings') {
					const channelId = this.getNodeParameter('channelId', i) as string;
					const settings = await nadiaApiRequest.call(
						this,
						'GET',
						`/integration-settings/${channelId}`,
					);
					responseData = settings?.output ?? settings;
				} else if (operation === 'getPosts') {
					const fallback = defaultDateRange(30);
					const startDate = (this.getNodeParameter('startDate', i, '') as string) || fallback.startDate;
					const endDate = (this.getNodeParameter('endDate', i, '') as string) || fallback.endDate;
					const channelId = this.getNodeParameter('postsChannelId', i, '') as string;
					const brandId = this.getNodeParameter('brandId', i, '') as string;

					const response = await nadiaApiRequest.call(this, 'GET', '/posts', undefined, {
						startDate,
						endDate,
						...(channelId ? { integration: channelId } : {}),
						...(brandId ? { group: brandId } : {}),
					});
					responseData = response?.posts ?? response;
				} else if (operation === 'uploadFile') {
					responseData = await uploadFile.call(this, i);
				} else if (operation === 'uploadFromUrl') {
					const fileUrl = this.getNodeParameter('fileUrl', i) as string;
					responseData = await nadiaApiRequest.call(this, 'POST', '/upload-from-url', {
						url: fileUrl,
					});
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
						itemIndex: i,
					});
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as IDataObject),
						{ itemData: { item: i } },
					),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

async function createPost(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const type = this.getNodeParameter('type', i) as 'schedule' | 'now' | 'draft';
	const content = this.getNodeParameter('content', i) as string;
	const rawMedia = this.getNodeParameter('media', i, '') as unknown;
	const settingsParam = this.getNodeParameter('settings', i, {}) as {
		value?: IDataObject | null;
	};
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

	let media;
	try {
		media = parseMedia(rawMedia);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
	}

	let date: string;
	if (type === 'schedule') {
		const useFreeSlot = this.getNodeParameter('useFreeSlot', i, false) as boolean;
		if (useFreeSlot) {
			const slot = await nadiaApiRequest.call(this, 'GET', `/find-slot/${channelId}`);
			date = slot?.date;
			if (!date) {
				throw new NodeOperationError(
					this.getNode(),
					'Nadia returned no free slot for this channel',
					{ itemIndex: i },
				);
			}
		} else {
			date = new Date(this.getNodeParameter('date', i) as string).toISOString();
		}
	} else {
		// `now` and `draft` still need a valid date on the wire.
		date = new Date().toISOString();
	}

	const tags = toStringArray(additionalFields.tags).map((tag) => ({ value: tag, label: tag }));

	const body: IDataObject = {
		type,
		date,
		shortLink: (additionalFields.shortLink as boolean) ?? false,
		tags,
		posts: [
			{
				integration: { id: channelId },
				value: [
					{
						content: toPostHtml(content),
						image: media,
					},
				],
				...(additionalFields.group ? { group: additionalFields.group as string } : {}),
				settings: (settingsParam?.value ?? {}) as IDataObject,
			},
		],
	};

	return nadiaApiRequest.call(this, 'POST', '/posts', body);
}

async function uploadFile(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

	// `POST /upload` is a multipart endpoint (FileInterceptor('file')), so the
	// body is a FormData and the request must not be sent as JSON.
	const formData = new FormData();
	formData.append(
		'file',
		new Blob([buffer], { type: binaryData.mimeType || 'application/octet-stream' }),
		binaryData.fileName || 'file',
	);

	return nadiaApiRequest.call(this, 'POST', '/upload', undefined, undefined, {
		body: formData,
		json: false,
	});
}
