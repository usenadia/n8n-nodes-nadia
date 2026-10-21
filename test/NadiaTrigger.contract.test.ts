import { NadiaTrigger } from '../nodes/NadiaTrigger/NadiaTrigger.node';
// A byte-for-byte copy of the shared contract fixture that the server, the SDKs
// and this node all replay (nadia monorepo:
// libraries/nestjs-libraries/src/database/prisma/webhooks/__fixtures__/signed-delivery.json).
// It is copied rather than read by path because this package is published from
// a mirror that holds this folder alone. `node scripts/check-n8n-contract.mjs`
// fails when the two copies drift.
import fixture from './fixtures/signed-delivery.json';

const node = new NadiaTrigger();

// n8n hands header names lower-cased.
const lowerCase = (headers: Record<string, string>) =>
	Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

const deliver = ({
	rawBody,
	body = JSON.parse(rawBody ?? fixture.body),
	headers = lowerCase(fixture.headers),
	secret = fixture.secret,
}: {
	rawBody?: string;
	body?: unknown;
	headers?: Record<string, string>;
	secret?: string;
}) => {
	const response = { status: jest.fn(), json: jest.fn() };
	response.status.mockReturnValue(response);
	return node.webhook
		.call({
			// n8n's body parser keeps the bytes it read as `rawBody` (a Buffer) before
			// parsing JSON; without it the node falls back to JSON.stringify(body).
			getRequestObject: () => (rawBody === undefined ? {} : { rawBody: Buffer.from(rawBody) }),
			getHeaderData: () => headers,
			getBodyData: () => body,
			getNodeParameter: (name: string, fallback?: unknown) => {
				if (name === 'verifySignature') return true;
				if (name === 'events') return ['post.published'];
				return fallback;
			},
			getWorkflowStaticData: () => ({ secret }),
			helpers: { returnJsonArray: (d: unknown) => [{ json: d }] },
			getNode: () => ({ name: 'Nadia Trigger' }),
			getResponseObject: () => response,
		} as never)
		.then((result) => ({
			...result,
			status: response.status.mock.calls[0]?.[0] as number | undefined,
			error: (response.json.mock.calls[0]?.[0] as { error?: string } | undefined)?.error,
		}));
};

// A refused delivery is answered 401 by the node itself and starts nothing: a
// thrown error would become a 500, which Nadia retries three times for nothing.
const refused = { noWebhookResponse: true, status: 401, error: 'Nadia signature does not match' };

describe('signed delivery contract (shared fixture)', () => {
	it('accepts the delivery as n8n receives it (raw body kept), and outputs the envelope', async () => {
		const result = await deliver({ rawBody: fixture.body });
		expect(result.workflowData).toEqual([[{ json: fixture.delivery }]]);
	});

	// The fallback only holds if re-serialising the parsed body gives back the
	// bytes that were signed — which is what the server sends (JSON.stringify).
	it('re-serialises the parsed body to the exact signed bytes', () => {
		expect(JSON.stringify(fixture.delivery)).toBe(fixture.body);
	});

	it('accepts the delivery when n8n did not keep the raw body', async () => {
		const result = await deliver({ body: fixture.delivery });
		expect(result.workflowData).toEqual([[{ json: fixture.delivery }]]);
	});

	it('rejects a tampered body', async () => {
		await expect(deliver({ rawBody: fixture.tampered.body })).resolves.toMatchObject(refused);
	});

	it('rejects a tampered body even without the raw body', async () => {
		await expect(deliver({ body: JSON.parse(fixture.tampered.body) })).resolves.toMatchObject(
			refused,
		);
	});

	it('rejects a delivery checked with the wrong secret', async () => {
		await expect(
			deliver({ rawBody: fixture.body, secret: fixture.tampered.wrongSecret }),
		).resolves.toMatchObject(refused);
	});

	// The timestamp is part of what is signed: swapping it breaks the signature.
	it('rejects a delivery whose timestamp was swapped', async () => {
		const headers = {
			...lowerCase(fixture.headers),
			'x-nadia-timestamp': fixture.tampered.staleTimestamp,
		};
		await expect(deliver({ rawBody: fixture.body, headers })).resolves.toMatchObject(refused);
	});
});
