#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Workspace lifecycle manager for Tundra Connect.
 *
 * Every connect lives under `connectors/<name>/`, mirroring TundraLibs. Since
 * that's a real glob-able directory, `deno.json`'s `workspace` field and
 * `package.json`'s `workspaces` + `test:bun`/`test:node` scripts are static
 * (`connectors/*`) and never need regenerating. What's still generated here —
 * files that must enumerate connects individually rather than glob a
 * directory — is `.github/labeler.yml`, `.github/codecov.yml`,
 * `release-please-config.json`, `.release-please-manifest.json`, the issue
 * templates' connect dropdowns, and README.md's connect list. Never
 * hand-edit those.
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-run=deno .github/scripts/workspace.ts add <name>
 *   deno run --allow-read --allow-write .github/scripts/workspace.ts remove <name>
 *   deno run --allow-read --allow-write .github/scripts/workspace.ts sync [--check]
 *
 * `<name>` for `add` is always lowercased for the directory/package name.
 * For the display/class name: type it with the exact casing you want
 * (`add PayPal`, `add GCS`) to preserve it verbatim, or type it in the
 * traditional all-lowercase, hyphen-separated style (`add azure-blob`) to
 * have each segment auto-capitalized (`AzureBlob`) — see
 * `deriveDisplayName`'s doc comment. Got the casing wrong either way?
 * Hand-edit `.github/workspace-meta.json`, then run `deno task
 * workspace:sync`.
 */

import { fromFileUrl } from 'jsr:@std/path@^1.1.6';

const ROOT = fromFileUrl(new URL('../../', import.meta.url));
const CONNECTORS_DIR = 'connectors';
const SCOPE = '@tundraconnect';
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;

type WorkspaceMeta = Record<string, string>;

function path(...segments: string[]): string {
  return ROOT + segments.join('/');
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(file));
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await Deno.writeTextFile(file, JSON.stringify(data, null, 2) + '\n');
}

async function readText(file: string): Promise<string> {
  try {
    return await Deno.readTextFile(file);
  } catch {
    return '';
  }
}

/**
 * Derives the display/class name `add` records for a connect from the name
 * typed on the command line.
 *
 * If the typed name has any uppercase letter, the caller has spelled out
 * exactly the casing they want (`PayPal`, `GCS`) — preserve it verbatim,
 * only stripping `-`/`_` separators (illegal in a TS class identifier; the
 * lowercased directory name keeps them). Otherwise the name was typed in
 * the traditional all-lowercase, hyphen-separated style (`azure-blob`,
 * `upstash-redis`) — auto-capitalize each segment, same as every existing
 * connect. Either way, hand-edit `.github/workspace-meta.json` afterward
 * and re-run `deno task workspace:sync` if the result isn't quite right.
 */
function deriveDisplayName(rawName: string): string {
  if (/[A-Z]/.test(rawName)) {
    return rawName.replace(/[-_]/g, '');
  }
  return rawName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function loadMeta(): Promise<WorkspaceMeta> {
  return await readJson<WorkspaceMeta>(path('.github/workspace-meta.json'));
}

async function saveMeta(meta: WorkspaceMeta): Promise<void> {
  const sorted: WorkspaceMeta = {};
  for (
    const key of Object.keys(meta).sort((left, right) =>
      left.localeCompare(right)
    )
  ) {
    const value = meta[key];
    if (value !== undefined) sorted[key] = value;
  }
  await writeJson(path('.github/workspace-meta.json'), sorted);
}

function connectorNames(meta: WorkspaceMeta): string[] {
  return Object.keys(meta).sort((left, right) => left.localeCompare(right));
}

// ---------------------------------------------------------------------------
// Generators — each returns the file content it should have.
// ---------------------------------------------------------------------------

function genLabeler(meta: WorkspaceMeta): string {
  const lines = [
    'workflows:',
    '  - changed-files:',
    '      - any-glob-to-any-file: .github/workflows/*',
    'infra:',
    '  - changed-files:',
    '      - any-glob-to-any-file:',
    '          - deno.json',
    '          - package.json',
    '          - release-please-config.json',
    '          - .release-please-manifest.json',
    'documentation:',
    '  - changed-files:',
    "      - any-glob-to-any-file: ['**/README.md', '**/CHANGELOG.md']",
    '',
  ];
  for (const name of connectorNames(meta)) {
    lines.push(
      `'connector: ${name}':`,
      '  - changed-files:',
      `      - any-glob-to-any-file: ${CONNECTORS_DIR}/${name}/**`,
    );
  }
  return lines.join('\n') + '\n';
}

function genCodecov(meta: WorkspaceMeta): string {
  const components = connectorNames(meta).map((name) =>
    [
      '      - component_id: ' + name,
      '        name: ' + name,
      '        paths:',
      `          - ${CONNECTORS_DIR}/${name}/**`,
    ].join('\n')
  ).join('\n');
  return `# GENERATED by .github/scripts/workspace.ts — do not edit.
coverage:
  range: '70...90'
  status:
    project:
      default:
        target: auto
        threshold: 1%
    patch:
      default:
        target: 70%
        threshold: 5%

component_management:
  individual_components:
${components}

ignore:
  - '**/*.test.ts'
  - '**/*.bench.ts'
  - '**/tests/**'
  - '**/fixtures/**'
`;
}

function genReleasePleaseConfig(
  meta: WorkspaceMeta,
  existing: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const existingPackages = (existing?.packages as Record<string, unknown>) ??
    {};
  const pkgs: Record<string, unknown> = {};
  for (const name of connectorNames(meta)) {
    const key = `${CONNECTORS_DIR}/${name}`;
    pkgs[key] = existingPackages[key] ?? {
      'release-type': 'node',
      component: name,
      'bump-minor-pre-major': true,
      'extra-files': [
        { type: 'json', path: 'deno.json', jsonpath: '$.version' },
      ],
    };
  }
  return {
    $schema:
      'https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json',
    'separate-pull-requests': true,
    'include-component-in-tag': true,
    'changelog-sections': existing?.['changelog-sections'] ?? [
      { type: 'feat', section: 'Features' },
      { type: 'fix', section: 'Bug Fixes' },
      { type: 'perf', section: 'Performance' },
      { type: 'refactor', section: 'Refactoring' },
      { type: 'docs', section: 'Documentation' },
      { type: 'chore', section: 'Miscellaneous', hidden: true },
      { type: 'test', section: 'Tests', hidden: true },
      { type: 'ci', section: 'CI', hidden: true },
      { type: 'build', section: 'Build', hidden: true },
    ],
    packages: pkgs,
  };
}

async function genManifest(
  meta: WorkspaceMeta,
  existing: Record<string, string>,
): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  for (const name of connectorNames(meta)) {
    const key = `${CONNECTORS_DIR}/${name}`;
    if (existing[key]) {
      manifest[key] = existing[key];
      continue;
    }
    // New connector — seed from its own deno.json if present, else 0.0.0.
    const version = await readJson<{ version?: string }>(
      path(`${CONNECTORS_DIR}/${name}/deno.json`),
    ).then((d) => d.version).catch(() => undefined);
    manifest[key] = version ?? '0.0.0';
  }
  return manifest;
}

function genIssueDropdown(meta: WorkspaceMeta, includeNewOption: boolean) {
  const options = connectorNames(meta).map((name) => meta[name]);
  if (includeNewOption) options.push('new connector');
  return options;
}

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

function genIssueTemplates(meta: WorkspaceMeta): Generated[] {
  const bugOptions = genIssueDropdown(meta, false);
  const bug = `# GENERATED by .github/scripts/workspace.ts — do not edit.
name: 🐛 Bug Report
description: Report a bug in an existing connect
title: '[Connect Name] Brief description of the issue'
labels: [bug]
body:
  - type: dropdown
    id: connect-name
    attributes:
      label: Connect
      description: Which connect is this bug related to?
      options:
${bugOptions.map((o) => `        - ${o}`).join('\n')}
    validations:
      required: true
  - type: dropdown
    id: runtime
    attributes:
      label: Runtime
      options:
        - Deno
        - Bun
        - Node
        - Cloudflare Workers
        - Browser
        - Multiple
    validations:
      required: true
  - type: input
    id: runtime-version
    attributes:
      label: Runtime version
      placeholder: 'e.g. Deno 2.1.0'
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
`;

  const featureOptions = genIssueDropdown(meta, true);
  const feature = `# GENERATED by .github/scripts/workspace.ts — do not edit.
name: ✨ Feature Request
description: Request a new feature, or a new connect
title: '[Connect Name] Brief description'
labels: [enhancement]
body:
  - type: dropdown
    id: connect-name
    attributes:
      label: Connect
      description: Which connect is this for? Choose "new connector" to propose a new vendor integration.
      options:
${featureOptions.map((o) => `        - ${o}`).join('\n')}
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: Description
    validations:
      required: true
`;

  return [
    {
      file: '.github/ISSUE_TEMPLATE/bug_report.yml',
      content: bug,
      json: false,
    },
    {
      file: '.github/ISSUE_TEMPLATE/feature_request.yml',
      content: feature,
      json: false,
    },
  ];
}

async function genReadme(
  meta: WorkspaceMeta,
  current: string,
): Promise<string> {
  const START = '<!-- workspace:connectors:start -->';
  const END = '<!-- workspace:connectors:end -->';
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`README.md is missing the ${START} / ${END} markers.`);
  }
  const entries = await Promise.all(
    connectorNames(meta).map(async (name) => {
      const denoJson = await readJson<
        { name?: string; description?: string }
      >(
        path(`${CONNECTORS_DIR}/${name}/deno.json`),
      ).catch(() => ({}) as { name?: string; description?: string });
      const displayName = meta[name];
      const jsrName = denoJson.name ?? `${SCOPE}/${name}`;
      const description = denoJson.description ?? 'TODO: Add description';
      return `- **[${displayName}](./${CONNECTORS_DIR}/${name}/README.md)** — [\`${jsrName}\`](https://jsr.io/${jsrName}) — ${description}`;
    }),
  );
  return current.slice(0, start + START.length) +
    '\n\n## 📦 Connects\n\n' + entries.join('\n') + '\n\n' +
    current.slice(end);
}

interface Generated {
  file: string;
  content: string | Record<string, unknown>;
  json: boolean;
}

async function buildGenerated(meta: WorkspaceMeta): Promise<Generated[]> {
  const existingRP = await readJson<Record<string, unknown>>(
    path('release-please-config.json'),
  ).catch(() => undefined);
  const existingManifest = await readJson<Record<string, string>>(
    path('.release-please-manifest.json'),
  ).catch(() => ({}));
  const existingReadme = await readText(path('README.md'));

  return [
    { file: '.github/labeler.yml', content: genLabeler(meta), json: false },
    { file: '.github/codecov.yml', content: genCodecov(meta), json: false },
    {
      file: 'release-please-config.json',
      content: genReleasePleaseConfig(meta, existingRP),
      json: true,
    },
    {
      file: '.release-please-manifest.json',
      content: await genManifest(meta, existingManifest ?? {}),
      json: true,
    },
    {
      file: 'README.md',
      content: await genReadme(meta, existingReadme),
      json: false,
    },
    ...genIssueTemplates(meta),
  ];
}

async function applyGenerated(meta: WorkspaceMeta): Promise<void> {
  for (const gen of await buildGenerated(meta)) {
    if (gen.json) {
      await writeJson(path(gen.file), gen.content);
    } else {
      await Deno.writeTextFile(path(gen.file), gen.content as string);
    }
  }
}

async function checkGenerated(meta: WorkspaceMeta): Promise<boolean> {
  let drifted = false;
  for (const gen of await buildGenerated(meta)) {
    const current = gen.json
      ? JSON.stringify(
        await readJson(path(gen.file)).catch(() => null),
        null,
        2,
      ) + '\n'
      : await readText(path(gen.file));
    const expected = gen.json
      ? JSON.stringify(gen.content, null, 2) + '\n'
      : gen.content as string;
    if (current !== expected) {
      console.error(`drift: ${gen.file}`);
      drifted = true;
    }
  }
  return !drifted;
}

// ---------------------------------------------------------------------------
// Connect scaffolding — content generators for `add`'s per-connect files.
//
// Every generated file mirrors the shape CONVENTIONS.md's "Connect
// (connector) layout" section documents, using a small, simple existing
// connect (connectors/ntfy/) as the reference implementation. Anything
// vendor-specific is left as a clearly marked TODO rather than fabricated.
// ---------------------------------------------------------------------------

const UTILS_IMPORT_SPECIFIER = 'jsr:@tundralibs/utils@^1.0.5';
const UTILS_NPM_SPECIFIER = 'npm:@jsr/tundralibs__utils@^1.0.5';

/** The `exports` map every connect's `deno.json`/`package.json` shares. */
function connectExportsMap(): Record<string, string> {
  return {
    '.': './mod.ts',
    './schemas': './schema/mod.ts',
    './errors': './errors/mod.ts',
  };
}

function genConnectDenoJson(name: string): Record<string, unknown> {
  return {
    name: `${SCOPE}/${name}`,
    version: '0.0.0',
    description: 'TODO: Add description',
    exports: connectExportsMap(),
    imports: { '@utils': UTILS_IMPORT_SPECIFIER },
  };
}

function genConnectPackageJson(name: string): Record<string, unknown> {
  return {
    name: `${SCOPE}/${name}`,
    version: '0.0.0',
    type: 'module',
    description: 'TODO: Add description',
    exports: connectExportsMap(),
    engines: { node: '>=22' },
    dependencies: { '@tundralibs/utils': UTILS_NPM_SPECIFIER },
  };
}

function genConnectModTs(name: string, className: string): string {
  return `/**
 * @module ${SCOPE}/${name}
 */

// Export main client class
export { ${className}, type ${className}Options } from './${className}.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
`;
}

function genConnectClass(name: string, className: string): string {
  return `import {
  RESTler,
  type RESTlerAuth,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import type { BaseGuardian, GuardianError } from '@guardian';
import { ${className}Error } from './errors/mod.ts';

/**
 * Options for configuring a {@link ${className}} client.
 *
 * TODO: narrow \`auth\` to ${className}'s actual scheme once known —
 * BASIC/BEARER need no \`_authInjector\` override (RESTler's base
 * implementation already emits the header); anything else (a custom
 * header, a query parameter, ...) uses \`{ type: 'CUSTOM', ...fields }\`
 * plus an \`_authInjector\` override that calls
 * \`super._authInjector(endpoint)\` first. See CONVENTIONS.md's
 * "Credentials" section.
 */
export type ${className}Options = Omit<RESTlerOptions, 'auth'> & {
  /** ${className} credentials. */
  auth: RESTlerAuth;
};

/**
 * ${className} client.
 *
 * TODO: describe what this connect does and link the vendor's API docs.
 *
 * @example
 * \`\`\`typescript
 * import { ${className} } from '${SCOPE}/${name}';
 *
 * const client = new ${className}({
 *   auth: { type: 'BEARER', token: 'TODO' },
 * });
 * \`\`\`
 */
export class ${className} extends RESTler<${className}Options> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = '${className}';

  /**
   * Creates a new ${className} client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - ${className} credentials — see
   * {@link ${className}Options}.
   */
  constructor(options: EventOptionKeys<${className}Options, RESTlerEvents>) {
    super(options, {
      // TODO: set baseURL to ${className}'s actual API base URL. This
      // placeholder is a syntactically valid URL only so the client can
      // still be constructed (and tested) before that's done.
      baseURL: 'https://TODO.example.com',
      timeout: 10,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  // TODO: add endpoint methods here. Each one builds a RESTlerEndpoint and
  // delegates the rest to __requestAndValidate below, e.g. (once a real
  // request/response schema exists — see CONVENTIONS.md's "HTTP client"
  // section and connectors/ntfy/Ntfy.ts's publish() for a complete
  // reference):
  //
  // public async someMethod(request: SomeRequestSchema): Promise<SomeResponseSchema> {
  //   let payload: SomeRequestSchema;
  //   try {
  //     payload = SomeRequestSchemaObject.parse(request);
  //   } catch (cause) {
  //     throw new ${className}Error(
  //       'INVALID_REQUEST',
  //       {},
  //       cause instanceof GuardianError ? cause : undefined,
  //     );
  //   }
  //   return await this.__requestAndValidate(
  //     { path: '/TODO', method: 'POST', contentType: 'JSON', payload },
  //     SomeResponseSchemaObject,
  //   );
  // }

  /**
   * Makes a request and validates its response body against \`guard\`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link ${className}Error} — see CONVENTIONS.md's "HTTP client"
   * section for the full rationale.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {${className}Error} \`RESPONSE_ERROR\` when the body fails
   * validation.
   */
  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new ${className}Error('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler — translates ${className}'s
   * HTTP-status/error-envelope conventions into a {@link ${className}Error}.
   * Runs on every response (registered on \`_responseHandler\` in the
   * constructor); does nothing for a response below 400, leaving
   * success-body validation to {@link __requestAndValidate}.
   *
   * TODO: replace this generic status-code fallback with ${className}'s
   * actual documented error envelope — parse the response body, map
   * vendor-specific codes, and attach diagnostic metadata (see
   * connectors/ntfy/Ntfy.ts's __toError for a complete reference).
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {${className}Error} \`SERVICE_UNAVAILABLE\` for a 5xx response,
   * \`UNKNOWN_ERROR\` otherwise.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    throw new ${className}Error(
      status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR',
      { status, body: response.body },
    );
  }
}
`;
}

function genConnectClassTest(name: string, className: string): string {
  return `import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ${className} } from './${className}.ts';

class Mock${className} extends ${className} {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  };
  private responseBody: BodyInit | null = null;
  private responseStatus = 200;
  private responseHeaders: Record<string, string> = {
    'content-type': 'application/json',
  };

  setResponse(
    body: BodyInit | null,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    this.responseBody = body;
    this.responseStatus = status;
    this.responseHeaders = headers;
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body ?? undefined,
      };
      return Promise.resolve(
        new Response(this.responseBody, {
          status: this.responseStatus,
          headers: this.responseHeaders,
        }),
      );
    };
  }
}

describe('${className}', () => {
  it('constructs with the required auth option', () => {
    const client = new Mock${className}({
      auth: { type: 'BEARER', token: 'test-token' },
    });
    asserts.assertEquals(client.vendor, '${className}');
  });
});
`;
}

function genErrorsBase(name: string, className: string): string {
  return `import { RESTlerError } from '@restler';
import { type ${className}ErrorCode, ${className}ErrorCodes } from './${className}ErrorCodes.ts';

/** Metadata supplied with a {@link ${className}Error}. */
export type ${className}ErrorMetadata = {
  vendor: string;
  originalCode?: ${className}ErrorCode;
} & Record<string, unknown>;

/**
 * Base error for ${className} configuration, vendor, and response failures.
 *
 * @example
 * \`\`\`ts
 * import { ${className}Error } from '${SCOPE}/${name}/errors';
 *
 * throw new ${className}Error('SERVICE_UNAVAILABLE', { status: 503 });
 * \`\`\`
 */
export class ${className}Error<
  M extends ${className}ErrorMetadata = ${className}ErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link ${className}ErrorCodes}).
   */
  public readonly code: ${className}ErrorCode;

  protected override get _messageTemplate(): string {
    return '[${name}] \${timeStamp}: \${message}';
  }

  /**
   * Creates an error with ${className} vendor metadata.
   *
   * @param code ${className} error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: ${className}ErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: '${className}' } as M;

    if (!${className}ErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '\${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of ${className}ErrorCodes[code].matchAll(/\\$\\{(\\w+)\\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = \`<\${key} unavailable>\`;
      }
    }

    super(${className}ErrorCodes[code], context, cause);
    this.code = code;
  }
}
`;
}

function genErrorsCodes(name: string, className: string): string {
  const entries: Array<[string, string]> = [
    [
      'UNKNOWN_ERROR',
      `'An unknown error occurred while communicating with ${className}.'`,
    ],
    [
      'INVALID_REQUEST',
      `'${className} rejected the request as invalid (HTTP \${status}).'`,
    ],
    [
      'RESPONSE_ERROR',
      `'${className} API response did not match the expected schema.'`,
    ],
    [
      'SERVICE_UNAVAILABLE',
      `'${className} service is currently unavailable (HTTP \${status}).'`,
    ],
  ];
  const body = entries.map(([key, value]) => `  ${key}: ${value},`).join(
    '\n',
  );
  return `/**
 * ${className} error-code to message-template map.
 *
 * Starter registry — covers what every connect needs regardless of vendor
 * specifics: an unknown-code fallback, a generic invalid-request /
 * response-validation pair, and a generic service-unavailable fallback.
 *
 * TODO: add ${className}-specific error codes here as documented vendor
 * error responses are mapped (see CONVENTIONS.md's "Errors" section and
 * an existing connect's errors/<Connect>ErrorCodes.ts, e.g.
 * connectors/ntfy/errors/NtfyErrorCodes.ts, for the expected shape).
 */
export const ${className}ErrorCodes = {
${body}
} as const;

/** Valid ${className} error code. */
export type ${className}ErrorCode = keyof typeof ${className}ErrorCodes;
`;
}

function genErrorsBaseTest(name: string, className: string): string {
  return `import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ${className}Error } from './Base.ts';
import { ${className}ErrorCodes } from './${className}ErrorCodes.ts';

describe('${className}.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new ${className}Error('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), '${className}');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new ${className}Error('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      ${className}ErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new ${className}Error('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new ${className}Error('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new ${className}Error('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('\${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });
});
`;
}

function genErrorsMod(name: string, className: string): string {
  return `/** Error types and codes for the ${className} connect. */
export { ${className}Error, type ${className}ErrorMetadata } from './Base.ts';
export { type ${className}ErrorCode, ${className}ErrorCodes } from './${className}ErrorCodes.ts';
`;
}

function genSchemaMod(name: string, className: string): string {
  return `/**
 * Guardian schemas exported by \`${SCOPE}/${name}/schemas\`.
 *
 * TODO: this connect has no schemas yet. Add one Guardian object +
 * inferred type per file under schema/ (per CONVENTIONS.md's "Schemas"
 * section) and re-export each one here as it's created — see an existing
 * connect's schema/mod.ts (e.g. connectors/ntfy/schema/mod.ts) for the
 * expected shape.
 */
export {};
`;
}

function genDocsApi(name: string, className: string): string {
  const table = [
    '| Method | Endpoint | Result |',
    '| --- | --- | --- |',
    '| TODO() | TODO /path | TODO |',
  ].join('\n');
  return `# ${className} API

## Configuration

\`\`\`ts
import { ${className} } from '${SCOPE}/${name}';

const client = new ${className}({
  auth: { type: 'BEARER', token: 'TODO' }, // TODO: vendor credentials
});
\`\`\`

TODO: document every \`${className}Options\` field once implemented (see
CONVENTIONS.md's "Configuration (Options pattern)" and "Credentials"
sections).

## Endpoints

TODO: list each public method here as it's implemented, matching this
table shape:

${table}

See [Errors](${className}-Errors.md) for failure handling and
[Schemas](${className}-Schemas.md) for request/response validation.

---

[← Back to ${className}](../README.md)
`;
}

function genDocsErrors(name: string, className: string): string {
  const table = [
    '| Code | Meaning |',
    '| --- | --- |',
    '| `UNKNOWN_ERROR` | An unmapped status was returned, or an unknown code was supplied. |',
    `| \`INVALID_REQUEST\` | TODO — replace with ${className}'s actual invalid-request meaning. |`,
    "| `RESPONSE_ERROR` | A success response's body failed schema validation. |",
    `| \`SERVICE_UNAVAILABLE\` | TODO — replace with ${className}'s actual service-unavailable meaning. |`,
  ].join('\n');
  return `# ${className} Errors

\`${className}\` throws \`${className}Error\` for local request validation and
vendor responses — see [errors/Base.ts](../errors/Base.ts) and
[errors/${className}ErrorCodes.ts](../errors/${className}ErrorCodes.ts).

\`\`\`ts
import { ${className}Error, ${className}ErrorCodes } from '${SCOPE}/${name}/errors';

const error = new ${className}Error('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message);
\`\`\`

## Codes

TODO: extend this table as vendor-specific codes are added to
\`errors/${className}ErrorCodes.ts\`.

${table}

The resolved code is also available as a public, readonly \`error.code\`
property — branch on failure mode without matching against \`.message\`:

\`\`\`ts
if (error instanceof ${className}Error && error.code === 'SERVICE_UNAVAILABLE') {
  // ...
}
\`\`\`

Use \`getContextValue()\` to read diagnostic metadata — see
[errors/Base.ts](../errors/Base.ts).

---

[← Back to ${className}](../README.md)
`;
}

function genDocsSchemas(name: string, className: string): string {
  return `# ${className} Schemas

The \`${SCOPE}/${name}/schemas\` subpath exports Guardian validators and
inferred types.

TODO: this connect has no schemas yet — add one Guardian object + inferred
type per file under \`schema/\`, re-export each through \`schema/mod.ts\`,
and document it here (see CONVENTIONS.md's "Schemas" section and an
existing connect's docs page, e.g. connectors/ntfy/docs/ntfy-Schemas.md,
for the expected shape).

---

[← Back to ${className}](../README.md)
`;
}

function genConnectReadme(name: string, className: string): string {
  const docsTable = [
    '| Topic | Description |',
    '| --- | --- |',
    `| [API](docs/${className}-API.md) | Client configuration and endpoint methods |`,
    `| [Errors](docs/${className}-Errors.md) | Error codes and diagnostic metadata |`,
    `| [Schemas](docs/${className}-Schemas.md) | Public Guardian schemas and inferred types |`,
  ].join('\n');
  return `# ${className}

TODO: Add a one-paragraph description of what this connect does and which
vendor API it wraps.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

TODO: Expand on what the vendor API does and what this connect currently
covers.

\`\`\`ts
import { ${className} } from '${SCOPE}/${name}';

const client = new ${className}({
  auth: { type: 'BEARER', token: 'TODO' },
});
\`\`\`

## Documentation

${docsTable}

## Upstream

- [Vendor API reference](TODO: Add official vendor documentation URL)
- [Create a vendor account](TODO: Add signup URL, including referral code when available)

## Installation

**Deno:**

\`\`\`sh
deno add jsr:${SCOPE}/${name}
\`\`\`

**Bun:**

\`\`\`sh
bunx jsr add ${SCOPE}/${name}
\`\`\`

**Node.js:**

\`\`\`sh
npx jsr add ${SCOPE}/${name}
\`\`\`

## Quick Start

TODO: Add a realistic end-to-end usage example once the client has a real
endpoint method.

## License

MIT
`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function scaffold(name: string, className: string): Promise<void> {
  const dir = path(`${CONNECTORS_DIR}/${name}`);

  await Deno.mkdir(dir, { recursive: true });
  await Deno.mkdir(`${dir}/docs`, { recursive: true });
  await Deno.mkdir(`${dir}/errors`, { recursive: true });
  await Deno.mkdir(`${dir}/schema`, { recursive: true });

  await writeJson(`${dir}/deno.json`, genConnectDenoJson(name));
  await writeJson(`${dir}/package.json`, genConnectPackageJson(name));

  await Deno.writeTextFile(`${dir}/mod.ts`, genConnectModTs(name, className));
  await Deno.writeTextFile(
    `${dir}/README.md`,
    genConnectReadme(name, className),
  );
  await Deno.writeTextFile(`${dir}/CHANGELOG.md`, '');

  await Deno.writeTextFile(
    `${dir}/${className}.ts`,
    genConnectClass(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/${className}.test.ts`,
    genConnectClassTest(name, className),
  );

  await Deno.writeTextFile(
    `${dir}/errors/Base.ts`,
    genErrorsBase(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/errors/${className}ErrorCodes.ts`,
    genErrorsCodes(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/errors/Base.test.ts`,
    genErrorsBaseTest(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/errors/mod.ts`,
    genErrorsMod(name, className),
  );

  await Deno.writeTextFile(
    `${dir}/schema/mod.ts`,
    genSchemaMod(name, className),
  );

  await Deno.writeTextFile(
    `${dir}/docs/${className}-API.md`,
    genDocsApi(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/docs/${className}-Errors.md`,
    genDocsErrors(name, className),
  );
  await Deno.writeTextFile(
    `${dir}/docs/${className}-Schemas.md`,
    genDocsSchemas(name, className),
  );

  // The templates above are written naively — long \`${className}\`-derived
  // identifiers can overflow the 80-column line width. Normalizing with the
  // real formatter (rather than imitating its wrapping in each template)
  // keeps every scaffolded file `deno fmt --check`-clean by construction.
  // Spawned by name (not Deno.execPath()) so the workspace:add task can stay
  // scoped to `--allow-run=deno`: under `deno task`, execPath() is the
  // symlink-resolved binary path, which the PATH-resolved allowlist entry
  // does not match.
  const fmt = await new Deno.Command('deno', {
    args: ['fmt', dir],
    cwd: ROOT,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!fmt.success) {
    console.error(new TextDecoder().decode(fmt.stderr));
    console.error(`deno fmt failed on '${dir}' — scaffold aborted.`);
    Deno.exit(1);
  }
}

async function add(rawName: string): Promise<void> {
  if (!NAME_PATTERN.test(rawName)) {
    console.error(
      `Invalid connect name '${rawName}' — must match ${NAME_PATTERN}`,
    );
    Deno.exit(1);
  }
  // The typed name's lowercased form is the directory and package name;
  // its display/class name is derived per deriveDisplayName's doc comment
  // — see also the file-header usage note.
  const displayName = deriveDisplayName(rawName);
  const name = rawName.toLowerCase();
  const meta = await loadMeta();
  if (meta[name]) {
    console.error(`Connect '${name}' already exists.`);
    Deno.exit(1);
  }
  const dir = path(`${CONNECTORS_DIR}/${name}`);
  if (await Deno.stat(dir).then(() => true, () => false)) {
    console.error(
      `Directory '${CONNECTORS_DIR}/${name}/' already exists — delete or ` +
        `move it first (workspace:remove intentionally keeps it).`,
    );
    Deno.exit(1);
  }
  meta[name] = displayName;
  await scaffold(name, displayName);
  await saveMeta(meta);
  await applyGenerated(meta);
  console.log(
    `Added connect '${name}' (${SCOPE}/${name}, display name '${displayName}').`,
  );
}

async function remove(rawName: string): Promise<void> {
  const name = rawName.toLowerCase();
  const meta = await loadMeta();
  if (!meta[name]) {
    console.error(`Connect '${name}' is not registered.`);
    Deno.exit(1);
  }
  delete meta[name];
  await saveMeta(meta);
  await applyGenerated(meta);
  console.log(
    `Removed connect '${name}' from generated config. ` +
      `The '${CONNECTORS_DIR}/${name}/' directory was NOT deleted — remove it manually if desired.`,
  );
}

async function sync(check: boolean): Promise<void> {
  const meta = await loadMeta();
  if (check) {
    const ok = await checkGenerated(meta);
    if (!ok) {
      console.error(
        'Generated config is out of date. Run `deno task workspace:sync`.',
      );
      Deno.exit(1);
    }
    console.log('Generated config is up to date.');
    return;
  }
  await applyGenerated(meta);
  console.log('Synced generated config.');
}

async function main() {
  const [command, arg] = Deno.args;
  switch (command) {
    case 'add':
      if (!arg) throw new Error('Usage: workspace.ts add <name>');
      await add(arg);
      break;
    case 'remove':
      if (!arg) throw new Error('Usage: workspace.ts remove <name>');
      await remove(arg);
      break;
    case 'sync':
      await sync(Deno.args.includes('--check'));
      break;
    default:
      console.error('Usage: workspace.ts <add|remove|sync> [name] [--check]');
      Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
