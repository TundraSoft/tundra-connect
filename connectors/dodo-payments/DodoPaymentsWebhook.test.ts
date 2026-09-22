import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DEFAULT_TOLERANCE_SECONDS,
  signedContent,
  verifyWebhookSignature,
} from './DodoPaymentsWebhook.ts';
import { DodoPaymentsError } from './errors/mod.ts';

/** `whsec_` + base64("super-secret-key-material-0123") */
const SECRET = `whsec_${btoa('super-secret-key-material-0123')}`;
const WEBHOOK_ID = 'msg_2abc';
const NOW_MS = 1_700_000_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));
const PAYLOAD = JSON.stringify({
  type: 'payment.succeeded',
  data: { payment_id: 'pay_1' },
});

/** Independently recomputes the expected signature, the way Dodo's sender would. */
async function sign(
  payload: string,
  id = WEBHOOK_ID,
  timestamp = TIMESTAMP,
  secret = SECRET,
): Promise<string> {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const binary = atob(raw);
  const keyBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) keyBytes[i] = binary.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(
      signedContent(id, timestamp, payload),
    ) as unknown as BufferSource,
  );
  let out = '';
  for (const byte of new Uint8Array(mac)) out += String.fromCharCode(byte);
  return btoa(out);
}

function headers(signature: string, overrides: Record<string, string> = {}) {
  return {
    'webhook-id': WEBHOOK_ID,
    'webhook-timestamp': TIMESTAMP,
    'webhook-signature': `v1,${signature}`,
    ...overrides,
  };
}

describe('DodoPaymentsWebhook — signedContent', () => {
  it('joins id, timestamp and raw payload with periods', () => {
    asserts.assertEquals(
      signedContent('msg_1', '1700000000', '{"a":1}'),
      'msg_1.1700000000.{"a":1}',
    );
  });
});

describe('DodoPaymentsWebhook — verifyWebhookSignature', () => {
  it('accepts a genuine signature and returns the parsed payload', async () => {
    const event = await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: headers(await sign(PAYLOAD)),
      secret: SECRET,
      nowMs: NOW_MS,
    }) as { type: string; data: { payment_id: string } };
    asserts.assertEquals(event.type, 'payment.succeeded');
    asserts.assertEquals(event.data.payment_id, 'pay_1');
  });

  it('accepts a secret supplied without the whsec_ prefix', async () => {
    const bare = SECRET.slice('whsec_'.length);
    await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: headers(await sign(PAYLOAD, WEBHOOK_ID, TIMESTAMP, bare)),
      secret: bare,
      nowMs: NOW_MS,
    });
  });

  it('accepts a Headers instance as well as a plain object', async () => {
    const h = new Headers(headers(await sign(PAYLOAD)));
    const event = await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: h,
      secret: SECRET,
      nowMs: NOW_MS,
    }) as { type: string };
    asserts.assertEquals(event.type, 'payment.succeeded');
  });

  it('looks headers up case-insensitively', async () => {
    const signature = await sign(PAYLOAD);
    const event = await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: {
        'Webhook-Id': WEBHOOK_ID,
        'WEBHOOK-TIMESTAMP': TIMESTAMP,
        'Webhook-Signature': `v1,${signature}`,
      },
      secret: SECRET,
      nowMs: NOW_MS,
    }) as { type: string };
    asserts.assertEquals(event.type, 'payment.succeeded');
  });

  it('accepts when one of several rotated signatures matches', async () => {
    const good = await sign(PAYLOAD);
    const event = await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: headers('', {
        'webhook-signature': `v1,${btoa('wrong-signature-here')} v1,${good}`,
      }),
      secret: SECRET,
      nowMs: NOW_MS,
    }) as { type: string };
    asserts.assertEquals(event.type, 'payment.succeeded');
  });

  it('rejects a tampered payload — the forged-webhook case', async () => {
    const signature = await sign(PAYLOAD);
    const tampered = JSON.stringify({
      type: 'payment.succeeded',
      data: { payment_id: 'pay_ATTACKER' },
    });
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: tampered,
          headers: headers(signature),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects a signature made with the wrong secret', async () => {
    const wrong = `whsec_${btoa('a-completely-different-key-xxxx')}`;
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers(await sign(PAYLOAD, WEBHOOK_ID, TIMESTAMP, wrong)),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects a signature bound to a different webhook id', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers(await sign(PAYLOAD, 'msg_OTHER')),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects an unknown signature version', async () => {
    const signature = await sign(PAYLOAD);
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers('', {
            'webhook-signature': `v2,${signature}`,
          }),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects a replayed request older than the tolerance', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers(await sign(PAYLOAD)),
          secret: SECRET,
          // Same signature, replayed one second past the window.
          nowMs: NOW_MS + (DEFAULT_TOLERANCE_SECONDS + 1) * 1000,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  it('rejects a far-future timestamp, not just a stale one', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers(await sign(PAYLOAD)),
          secret: SECRET,
          nowMs: NOW_MS - (DEFAULT_TOLERANCE_SECONDS + 1) * 1000,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  it('accepts a request right at the edge of the tolerance window', async () => {
    await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: headers(await sign(PAYLOAD)),
      secret: SECRET,
      nowMs: NOW_MS + DEFAULT_TOLERANCE_SECONDS * 1000,
    });
  });

  it('honours a custom tolerance', async () => {
    await verifyWebhookSignature({
      payload: PAYLOAD,
      headers: headers(await sign(PAYLOAD)),
      secret: SECRET,
      toleranceSeconds: 10_000,
      nowMs: NOW_MS + 9_000_000,
    });
  });

  it('rejects an unparseable timestamp', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: PAYLOAD,
          headers: headers(await sign(PAYLOAD), {
            'webhook-timestamp': 'not-a-number',
          }),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  for (
    const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']
  ) {
    it(`rejects a request missing ${missing}`, async () => {
      const full = headers(await sign(PAYLOAD)) as Record<string, string>;
      delete full[missing];
      const err = await asserts.assertRejects(
        async () =>
          await verifyWebhookSignature({
            payload: PAYLOAD,
            headers: full,
            secret: SECRET,
            nowMs: NOW_MS,
          }),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
      asserts.assertStringIncludes(
        String(err.getContextValue('reason')),
        missing,
      );
    });
  }

  it('rejects a verified-but-non-JSON payload rather than returning a string', async () => {
    const body = 'not json at all';
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: body,
          headers: headers(await sign(body)),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('is sensitive to whitespace — proving the raw body must be used', async () => {
    // A genuine signature over the raw body must NOT verify against a
    // re-serialized copy. This is the `req.json()` -> `JSON.stringify()`
    // mistake, and it has to fail loudly rather than silently pass.
    const raw = '{"type": "payment.succeeded"}'; // note the space
    const reserialized = JSON.stringify(JSON.parse(raw)); // '{"type":"payment.succeeded"}'
    asserts.assertNotEquals(raw, reserialized);
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: reserialized,
          headers: headers(await sign(raw)),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('never leaks the signing secret into a thrown error', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await verifyWebhookSignature({
          payload: 'tampered',
          headers: headers(await sign(PAYLOAD)),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      DodoPaymentsError,
    );
    const dumped = JSON.stringify(err.toJSON());
    asserts.assert(!dumped.includes(SECRET));
    asserts.assert(!dumped.includes(SECRET.slice('whsec_'.length)));
  });
});
