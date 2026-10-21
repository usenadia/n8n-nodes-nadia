import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export type NadiaFunctions =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

/**
 * One authenticated call to the Nadia public API.
 *
 * The base URL comes from the credential, never from a constant: Nadia is
 * self-hostable, and so is n8n.
 */
export async function nadiaApiRequest(
	this: NadiaFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	query?: IDataObject,
	overrides?: Partial<IHttpRequestOptions>,
	// The public API answers with a different shape per route (an array of
	// channels, a post, `{ output }`…); each caller reads what its route returns.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	let credentials;
	try {
		credentials = await this.getCredentials('nadiaApi');
	} catch {
		// Right after the node is dropped on the canvas, n8n loads the dropdowns
		// before it has attached a credential, and its own error (« Node does not
		// have any credentials set ») reads like a crash.
		throw new NodeOperationError(this.getNode(), 'Select a Nadia credential first', {
			description: 'Pick or create a Nadia API credential at the top of the node, then reopen it.',
		});
	}
	const host = String(credentials.host || '').replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${host}/public/v1${endpoint}`,
		json: true,
		...overrides,
	};

	if (body !== undefined) {
		options.body = body;
	}

	if (query !== undefined && Object.keys(query).length) {
		options.qs = query;
	}

	let response;
	try {
		response = await this.helpers.httpRequestWithAuthentication.call(this, 'nadiaApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as never);
	}

	if (looksLikeHtml(response)) {
		throw new NodeOperationError(this.getNode(), 'Nadia answered with a web page, not the API', {
			description: `The Host of the Nadia credential must end with /api — for example https://app.usenadia.com/api. It is ${host || 'empty'}.`,
		});
	}

	return response;
}

/**
 * A host without `/api` reaches the app, not the API: the app redirects to its
 * login page and the request « succeeds » with HTML. No route of the public API
 * answers HTML, so this is always a wrong Host.
 */
export function looksLikeHtml(response: unknown): boolean {
	return typeof response === 'string' && /^\s*<(!doctype|html)/i.test(response);
}

export interface NadiaChannel {
	id: string;
	name: string;
	identifier: string;
	picture?: string;
	disabled?: boolean;
	profile?: string;
	customer?: { id: string; name: string };
}

export interface NadiaBrand {
	id: string;
	name: string;
}

/**
 * `GET /posts` refuses a call without a window, so every listing needs one.
 * Kept here rather than inline so the node and its tests agree on the default.
 */
export function defaultDateRange(days: number): { startDate: string; endDate: string } {
	const end = new Date();
	const start = new Date(end.getTime() - days * 86_400_000);
	return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/**
 * Turn a comma-separated list, a JSON array or an already-parsed array into a
 * list of trimmed strings. n8n expressions produce all three.
 */
export function toStringArray(value: unknown): string[] {
	if (value === null || value === undefined || value === '') {
		return [];
	}

	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}

	const raw = String(value).trim();
	if (raw.startsWith('[')) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed.map((item) => String(item).trim()).filter(Boolean);
			}
		} catch {
			// Not JSON after all — fall through to the comma split.
		}
	}

	return raw
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

/**
 * Wrap plain text in a paragraph. The composer stores HTML and the server
 * sanitizes it, so text pasted from another node arrives without markup and
 * would otherwise lose its line breaks.
 */
export function toPostHtml(content: string): string {
	const trimmed = (content ?? '').trim();
	if (!trimmed) {
		return '';
	}

	if (/^\s*<[a-z][\s\S]*>/i.test(trimmed)) {
		return trimmed;
	}

	return trimmed
		.split(/\n{2,}/)
		.map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
		.join('');
}

/**
 * A media reference accepted by `POST /posts`: MediaDto requires BOTH `id` and
 * `path`, which is why the upload operations return the whole object and not
 * just the id.
 */
export interface NadiaMedia {
	id: string;
	path: string;
	alt?: string;
	thumbnail?: string;
}

/**
 * Accept what the Upload operations return (objects), a JSON array of them, or
 * a JSON string of either. Ids alone are refused on purpose: the API validates
 * `path` too, and a post silently scheduled without its image is worse than a
 * loud error here.
 */
function parseJsonOrUndefined(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function parseMedia(value: unknown): NadiaMedia[] {
	if (value === null || value === undefined || value === '') {
		return [];
	}

	let raw: unknown = value;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (!trimmed) {
			return [];
		}
		raw = parseJsonOrUndefined(trimmed);
		if (raw === undefined) {
			throw new Error(
				'Media must be a JSON array of objects with `id` and `path` — pass the output of an Upload operation',
			);
		}
	}

	const list = Array.isArray(raw) ? raw : [raw];

	return list.map((item) => {
		if (!item || typeof item !== 'object') {
			throw new Error(
				'Media must be objects with `id` and `path` — pass the output of an Upload operation',
			);
		}
		const media = item as Record<string, unknown>;
		if (!media.id || !media.path) {
			throw new Error(
				`Media entry is missing ${!media.id ? '`id`' : '`path`'} — pass the output of an Upload operation`,
			);
		}
		return {
			id: String(media.id),
			path: String(media.path),
			...(media.alt ? { alt: String(media.alt) } : {}),
			...(media.thumbnail ? { thumbnail: String(media.thumbnail) } : {}),
		};
	});
}

/**
 * `GET /integration-settings/:id` answers with the provider's own
 * class-validator schema, turned into JSON Schema server-side. Mapping it here
 * is what keeps the node's per-provider settings (TikTok alone requires eight)
 * in step with the backend without a release.
 */
export function jsonSchemaTypeToFieldType(
	schema: IDataObject,
): 'string' | 'number' | 'boolean' | 'array' | 'object' {
	const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
	switch (type) {
		case 'integer':
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'array':
			return 'array';
		case 'object':
			return 'object';
		default:
			return 'string';
	}
}
