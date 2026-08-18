import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EMBED_TOTAL_CHARACTER_LIMIT,
  EmbedSchemaObject,
  embedsWithinCharacterBudget,
} from './Embed.ts';

describe('Discord.schema.Embed', () => {
  it('accepts a minimal embed', () => {
    asserts.assertEquals(
      EmbedSchemaObject.safeParse({ description: 'Hello world' })[0],
      null,
    );
  });

  it('accepts a fully-populated embed', () => {
    const [error] = EmbedSchemaObject.safeParse({
      title: 'Deploy succeeded',
      description: 'Build #482 shipped to production.',
      url: 'https://example.com/builds/482',
      timestamp: '2024-01-01T12:00:00Z',
      color: 0x57f287,
      footer: { text: 'CI', icon_url: 'https://example.com/ci.png' },
      image: { url: 'https://example.com/graph.png' },
      thumbnail: { url: 'attachment://logo.png' },
      author: { name: 'Deploy Bot', url: 'https://example.com' },
      fields: [
        { name: 'Duration', value: '48s', inline: true },
        { name: 'Branch', value: 'main', inline: true },
      ],
    });
    asserts.assertEquals(error, null);
  });

  it('accepts an empty embed object', () => {
    asserts.assertEquals(EmbedSchemaObject.safeParse({})[0], null);
  });

  it('rejects a title over 256 characters', () => {
    asserts.assertExists(
      EmbedSchemaObject.safeParse({ title: 'x'.repeat(257) })[0],
    );
  });

  it('rejects a description over 4096 characters', () => {
    asserts.assertExists(
      EmbedSchemaObject.safeParse({ description: 'x'.repeat(4097) })[0],
    );
  });

  it('rejects more than 25 fields', () => {
    const fields = Array.from({ length: 26 }, (_, i) => ({
      name: `Field ${i}`,
      value: 'value',
    }));
    asserts.assertExists(EmbedSchemaObject.safeParse({ fields })[0]);
  });

  it('rejects a color outside the 24-bit range', () => {
    asserts.assertExists(
      EmbedSchemaObject.safeParse({ color: 0x1000000 })[0],
    );
  });

  it('rejects a negative color', () => {
    asserts.assertExists(EmbedSchemaObject.safeParse({ color: -1 })[0]);
  });

  it('rejects a field missing a value', () => {
    asserts.assertExists(
      EmbedSchemaObject.safeParse({ fields: [{ name: 'Duration' }] })[0],
    );
  });

  describe('embedsWithinCharacterBudget', () => {
    it('accepts undefined embeds', () => {
      asserts.assertEquals(embedsWithinCharacterBudget(undefined), true);
    });

    it('accepts an empty embeds array', () => {
      asserts.assertEquals(embedsWithinCharacterBudget([]), true);
    });

    it('accepts embeds within the combined budget', () => {
      const [, embed] = EmbedSchemaObject.safeParse({
        title: 'x'.repeat(100),
        description: 'y'.repeat(100),
      });
      asserts.assertEquals(embedsWithinCharacterBudget([embed!]), true);
    });

    it('rejects embeds exceeding the combined budget across multiple embeds', () => {
      const [, embed] = EmbedSchemaObject.safeParse({
        description: 'x'.repeat(4000),
      });
      const embeds = [embed!, embed!];
      asserts.assertEquals(
        embeds.reduce((sum, e) => sum + (e.description?.length ?? 0), 0) >
          EMBED_TOTAL_CHARACTER_LIMIT,
        true,
      );
      asserts.assertEquals(embedsWithinCharacterBudget(embeds), false);
    });

    it('counts field name/value and footer/author text toward the budget', () => {
      const [, embed] = EmbedSchemaObject.safeParse({
        footer: { text: 'f'.repeat(2000) },
        author: { name: 'a'.repeat(256) },
        fields: [{ name: 'n'.repeat(256), value: 'v'.repeat(1000) }],
      });
      // 2000 + 256 + 256 + 1000 = 3512, within budget on its own...
      asserts.assertEquals(embedsWithinCharacterBudget([embed!]), true);
      // ...but not twice over.
      asserts.assertEquals(
        embedsWithinCharacterBudget([embed!, embed!]),
        false,
      );
    });
  });
});
