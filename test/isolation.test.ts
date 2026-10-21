// This test runs in Node under jest, never inside n8n: the n8n Cloud import and
// global restrictions do not apply to it.
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			return entry === 'node_modules' || entry === 'dist' ? [] : walk(full);
		}
		return full.endsWith('.ts') ? [full] : [];
	});

const sources = [
	...walk(join(ROOT, 'nodes')),
	...walk(join(ROOT, 'credentials')),
	join(ROOT, 'index.ts'),
];

/**
 * This package is published under MIT from an AGPL-3.0 repository. That only
 * holds as long as it shares no code with the app: no import may leave the
 * package, and no monorepo internal (ours or upstream's) may be pulled in.
 */
describe('licence isolation', () => {
	it.each(sources.map((f) => [f.slice(ROOT.length + 1), f]))(
		'%s imports nothing from outside the package',
		(_name, file) => {
			const content = readFileSync(file, 'utf8');
			const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

			for (const specifier of imports) {
				expect(specifier).not.toMatch(/^@nadia\//);

				if (specifier.startsWith('.')) {
					const resolved = resolve(file, '..', specifier);
					expect(resolved.startsWith(ROOT)).toBe(true);
				}
			}
		},
	);

	it('declares no runtime dependency', () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
		expect(pkg.dependencies).toBeUndefined();
	});

	it('ships MIT', () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
		expect(pkg.license).toBe('MIT');
	});
});
