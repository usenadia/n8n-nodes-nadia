import {
	defaultDateRange,
	jsonSchemaTypeToFieldType,
	nadiaApiRequest,
	parseMedia,
	toPostHtml,
	toStringArray,
} from '../nodes/Nadia/GenericFunctions';
import { NadiaApi } from '../credentials/NadiaApi.credentials';

describe('nadiaApiRequest', () => {
	const makeContext = (host: string) => {
		const httpRequestWithAuthentication = jest.fn().mockResolvedValue({ ok: true });
		return {
			context: {
				getCredentials: jest.fn().mockResolvedValue({ apiKey: 'key', host }),
				helpers: { httpRequestWithAuthentication },
				getNode: () => ({ name: 'Nadia' }),
			},
			httpRequestWithAuthentication,
		};
	};

	it('builds the URL from the credential host, never from a constant', async () => {
		const { context, httpRequestWithAuthentication } = makeContext('https://social.example.com/api');

		await nadiaApiRequest.call(context as never, 'GET', '/integrations');

		expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
			method: 'GET',
			url: 'https://social.example.com/api/public/v1/integrations',
		});
	});

	it('tolerates a trailing slash on the host', async () => {
		const { context, httpRequestWithAuthentication } = makeContext('https://app.usenadia.com/api/');

		await nadiaApiRequest.call(context as never, 'GET', '/groups');

		expect(httpRequestWithAuthentication.mock.calls[0][1].url).toBe(
			'https://app.usenadia.com/api/public/v1/groups',
		);
	});

	it('omits an empty query string', async () => {
		const { context, httpRequestWithAuthentication } = makeContext('https://app.usenadia.com/api');

		await nadiaApiRequest.call(context as never, 'GET', '/groups', undefined, {});

		expect(httpRequestWithAuthentication.mock.calls[0][1].qs).toBeUndefined();
	});

	// A host without `/api` hits the app, which redirects to its login page:
	// the request succeeds with HTML, and a Get Channels would output the page.
	it('refuses an HTML answer and says the host must end with /api', async () => {
		const { context, httpRequestWithAuthentication } = makeContext('https://app.usenadia.com');
		httpRequestWithAuthentication.mockResolvedValue('<!DOCTYPE html><html><body>Login</body></html>');

		const call = nadiaApiRequest.call(context as never, 'GET', '/integrations');

		await expect(call).rejects.toThrow(/web page, not the API/);
		await expect(call).rejects.toMatchObject({
			description: expect.stringContaining('must end with /api'),
		});
	});

	// Dropdowns load before n8n attaches the credential to a freshly added node.
	it('asks for a credential instead of surfacing n8n\'s own error', async () => {
		const context = {
			getCredentials: jest.fn().mockRejectedValue(new Error('Node does not have any credentials set')),
			helpers: { httpRequestWithAuthentication: jest.fn() },
			getNode: () => ({ name: 'Nadia' }),
		};

		await expect(nadiaApiRequest.call(context as never, 'GET', '/groups')).rejects.toThrow(
			'Select a Nadia credential first',
		);
		expect(context.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});
});

describe('credential test', () => {
	const rules = new NadiaApi().test.rules as Array<{
		type: string;
		properties: { key: string; value: unknown; message: string };
	}>;
	// What n8n does with each rule: fail when the value at `key` equals `value`.
	const verdict = (body: unknown) =>
		rules.find(
			(rule) =>
				rule.type === 'responseSuccessBody' &&
				(body as Record<string, unknown> | null)?.[rule.properties.key] === rule.properties.value,
		)?.properties.message ?? 'ok';

	it('passes on the API answer', () => {
		expect(verdict({ connected: true })).toBe('ok');
	});

	it('fails on the login page a host without /api returns', () => {
		expect(verdict('<!DOCTYPE html><html></html>')).toMatch(/Host must end with \/api/);
		expect(verdict({})).toMatch(/Host must end with \/api/);
	});
});

describe('toPostHtml', () => {
	it('wraps plain text in a paragraph', () => {
		expect(toPostHtml('Hello')).toBe('<p>Hello</p>');
	});

	it('keeps single newlines as line breaks and splits on blank lines', () => {
		expect(toPostHtml('a\nb\n\nc')).toBe('<p>a<br />b</p><p>c</p>');
	});

	it('passes HTML through untouched', () => {
		expect(toPostHtml('<p>already</p>')).toBe('<p>already</p>');
	});

	it('returns an empty string for empty input', () => {
		expect(toPostHtml('   ')).toBe('');
	});
});

describe('toStringArray', () => {
	it('splits a comma-separated list', () => {
		expect(toStringArray('a, b ,c')).toEqual(['a', 'b', 'c']);
	});

	it('accepts a JSON array', () => {
		expect(toStringArray('["a","b"]')).toEqual(['a', 'b']);
	});

	it('accepts an actual array', () => {
		expect(toStringArray(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('returns an empty array for empty input', () => {
		expect(toStringArray('')).toEqual([]);
		expect(toStringArray(undefined)).toEqual([]);
	});
});

describe('parseMedia', () => {
	it('keeps id and path', () => {
		expect(parseMedia([{ id: '1', path: 'https://cdn/x.png' }])).toEqual([
			{ id: '1', path: 'https://cdn/x.png' },
		]);
	});

	it('parses a JSON string', () => {
		expect(parseMedia('[{"id":"1","path":"https://cdn/x.png"}]')).toHaveLength(1);
	});

	// MediaDto validates `path` too: a post scheduled without its image is
	// worse than a loud error here.
	it('refuses an entry without a path', () => {
		expect(() => parseMedia([{ id: '1' }])).toThrow(/path/);
	});

	it('refuses bare ids', () => {
		expect(() => parseMedia('abc,def')).toThrow(/JSON array/);
	});

	it('returns an empty array for empty input', () => {
		expect(parseMedia('')).toEqual([]);
		expect(parseMedia(null)).toEqual([]);
	});
});

describe('defaultDateRange', () => {
	it('returns an ISO window of the requested length', () => {
		const { startDate, endDate } = defaultDateRange(30);
		const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
		expect(Math.round(days)).toBe(30);
		expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe('jsonSchemaTypeToFieldType', () => {
	it.each([
		['string', 'string'],
		['integer', 'number'],
		['number', 'number'],
		['boolean', 'boolean'],
		['array', 'array'],
		['object', 'object'],
	])('maps %s to %s', (input, expected) => {
		expect(jsonSchemaTypeToFieldType({ type: input })).toBe(expected);
	});

	it('takes the first entry of a union and falls back to string', () => {
		expect(jsonSchemaTypeToFieldType({ type: ['boolean', 'null'] })).toBe('boolean');
		expect(jsonSchemaTypeToFieldType({})).toBe('string');
	});
});
