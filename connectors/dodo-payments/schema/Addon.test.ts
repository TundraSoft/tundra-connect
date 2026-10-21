import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AddonCartItemSchemaObject,
  AddonListSchemaObject,
  AddonSchemaObject,
  CreateAddonRequestSchemaObject,
  UpdateAddonRequestSchemaObject,
} from './Addon.ts';

const ADDON = {
  id: 'adn_1',
  business_id: 'biz_1',
  name: 'Extra seat',
  tax_category: 'saas',
  price: 500,
  currency: 'USD',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CREATE = {
  name: 'Extra seat',
  price: 500,
  currency: 'USD',
  tax_category: 'saas',
};

describe('DodoPayments.schema.AddonCartItem', () => {
  it('accepts an add-on and a quantity, zero included', () => {
    for (const quantity of [0, 1, 25]) {
      asserts.assertEquals(
        AddonCartItemSchemaObject.safeParse({ addon_id: 'adn_1', quantity })[0],
        null,
        String(quantity),
      );
    }
  });

  it('rejects a blank id, a bad quantity and an unknown field', () => {
    for (
      const item of [
        { addon_id: '', quantity: 1 },
        { addon_id: 'adn_1', quantity: -1 },
        { addon_id: 'adn_1', quantity: 1.5 },
        { addon_id: 'adn_1', quantity: '2' },
        { addon_id: 'adn_1' },
        { addon_id: 'adn_1', quantity: 1, price: 500 },
      ]
    ) {
      asserts.assertExists(
        AddonCartItemSchemaObject.safeParse(item)[0],
        JSON.stringify(item),
      );
    }
  });
});

describe('DodoPayments.schema.CreateAddonRequest', () => {
  it('accepts the required fields, with or without a description', () => {
    asserts.assertEquals(
      CreateAddonRequestSchemaObject.safeParse(CREATE)[0],
      null,
    );
    for (const description of ['One more person.', null]) {
      asserts.assertEquals(
        CreateAddonRequestSchemaObject.safeParse({ ...CREATE, description })[0],
        null,
      );
    }
  });

  it('rejects each missing required field', () => {
    for (const key of ['name', 'price', 'currency', 'tax_category']) {
      const body: Record<string, unknown> = { ...CREATE };
      delete body[key];
      asserts.assertExists(
        CreateAddonRequestSchemaObject.safeParse(body)[0],
        key,
      );
    }
  });

  it('rejects bad values', () => {
    for (
      const body of [
        { ...CREATE, name: '' },
        { ...CREATE, price: 4.5 },
        { ...CREATE, price: -1 },
        { ...CREATE, price: '500' },
        { ...CREATE, currency: 'usd' },
        { ...CREATE, tax_category: 'physical' },
        { ...CREATE, description: 'x'.repeat(1001) },
      ]
    ) {
      asserts.assertExists(
        CreateAddonRequestSchemaObject.safeParse(body)[0],
        JSON.stringify(body).slice(0, 80),
      );
    }
  });

  it('rejects an unknown field instead of silently dropping it', () => {
    const [error] = CreateAddonRequestSchemaObject.safeParse({
      ...CREATE,
      image_id: '6f1c0e1c-2b0e-4f5a-9a51-0b7c1a2d3e4f',
    });
    asserts.assertStringIncludes(error!.message, 'image_id');
  });
});

describe('DodoPayments.schema.UpdateAddonRequest', () => {
  it('accepts any one field, and null on each', () => {
    const fields: Record<string, unknown> = {
      name: 'Seat',
      price: 0,
      currency: 'EUR',
      tax_category: 'edtech',
      description: 'Changed.',
      image_id: '6F1C0E1C-2B0E-4F5A-9A51-0B7C1A2D3E4F',
    };
    for (const [key, value] of Object.entries(fields)) {
      asserts.assertEquals(
        UpdateAddonRequestSchemaObject.safeParse({ [key]: value })[0],
        null,
        key,
      );
      asserts.assertEquals(
        UpdateAddonRequestSchemaObject.safeParse({ [key]: null })[0],
        null,
        `${key}: null`,
      );
    }
  });

  it('keeps image_id: null in the body, so the image is removed', () => {
    const [error, body] = UpdateAddonRequestSchemaObject.safeParse({
      image_id: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body, { image_id: null });
  });

  it('rejects an update that changes nothing', () => {
    asserts.assertExists(UpdateAddonRequestSchemaObject.safeParse({})[0]);
  });

  it('rejects bad values and unknown fields', () => {
    for (
      const body of [
        { name: 'x'.repeat(101) },
        { name: '' },
        { description: 'x'.repeat(1001) },
        { price: -5 },
        { price: '5' },
        { currency: 'Dollars' },
        { tax_category: 'hardware' },
        { image_id: 'not-a-uuid' },
        { image: 'https://example.com/a.png' },
      ]
    ) {
      asserts.assertExists(
        UpdateAddonRequestSchemaObject.safeParse(body)[0],
        JSON.stringify(body).slice(0, 80),
      );
    }
  });
});

describe('DodoPayments.schema.Addon', () => {
  it('reads an add-on, unknown fields passing through', () => {
    const [error, addon] = AddonSchemaObject.safeParse({
      ...ADDON,
      description: null,
      image: 'https://cdn.example.com/seat.png',
      future_field: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(addon!.id, 'adn_1');
    asserts.assertEquals(addon!.image, 'https://cdn.example.com/seat.png');
    asserts.assertEquals(
      (addon as Record<string, unknown>).future_field,
      1,
    );
  });

  it('reads a tax category it does not know yet', () => {
    asserts.assertEquals(
      AddonSchemaObject.safeParse({ ...ADDON, tax_category: 'new_one' })[0],
      null,
    );
  });

  it('rejects a record missing a required field', () => {
    for (const key of Object.keys(ADDON)) {
      const body: Record<string, unknown> = { ...ADDON };
      delete body[key];
      asserts.assertExists(AddonSchemaObject.safeParse(body)[0], key);
    }
  });
});

describe('DodoPayments.schema.AddonList', () => {
  it('reads a page, an empty page and a bare array', () => {
    asserts.assertEquals(
      AddonListSchemaObject.safeParse({ items: [ADDON] })[1]!.items.length,
      1,
    );
    asserts.assertEquals(AddonListSchemaObject.safeParse({})[1]!.items, []);
    asserts.assertEquals(
      AddonListSchemaObject.safeParse([ADDON])[1]!.items[0]!.id,
      'adn_1',
    );
  });

  it('rejects a page holding a malformed add-on', () => {
    asserts.assertExists(
      AddonListSchemaObject.safeParse({ items: [{ id: 'adn_1' }] })[0],
    );
  });
});
