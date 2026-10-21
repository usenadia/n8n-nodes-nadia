import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class NadiaApi implements ICredentialType {
	name = 'nadiaApi';

	displayName = 'Nadia API';

	icon: Icon = 'file:nadia.svg';

	documentationUrl = 'https://usenadia.com/docs/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Nadia API key. Get it from <a href="https://app.usenadia.com/settings" target="_blank">Settings → Developers</a>. An OAuth token (<code>pos_…</code>) works here too.',
		},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'https://app.usenadia.com/api',
			required: true,
			description:
				'Base URL of the Nadia API. Self-hosting? The API sits behind <code>/api</code>, so the host must end with it — for example <code>https://social.example.com/api</code>.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				// Not a Bearer token: the public API reads the key raw.
				Authorization: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.host}}',
			url: '/public/v1/is-connected',
			method: 'GET',
		},
		// n8n fails the test when the value at `key` equals `value`. A host
		// without `/api` lands on the app itself, which redirects to its login
		// page: n8n follows, gets HTML in a 200, and would call that a success
		// even with a wrong key. Only the API answers `{ connected: true }`.
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'connected',
					value: undefined,
					message:
						'Nadia did not answer like its API. Host must end with /api — for example https://app.usenadia.com/api',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'connected',
					value: false,
					message: 'Nadia refused this API key',
				},
			},
		],
	};
}
