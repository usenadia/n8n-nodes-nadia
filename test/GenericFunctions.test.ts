import {
	defaultDateRange,
	jsonSchemaTypeToFieldType,
	nadiaApiRequest,
	parseMedia,
	toPostHtml,
	toStringArray,
} from '../nodes/Nadia/GenericFunctions';

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
