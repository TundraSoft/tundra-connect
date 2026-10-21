import { type BaseGuardian, Guardian } from '@guardian';
import { type TaxCategorySchema, TaxCategorySchemaObject } from './Product.ts';

/** Type definition for {@link AddonCartItemSchemaObject}. */
export type AddonCartItemSchema = {
  /** The add-on's `id`, as {@link AddonSchema} carries it. */
  addon_id: string;
  /** Units of the add-on; `0` is allowed. */
  quantity: number;
};

/**
 * Schema for one add-on line sent with a subscription: the add-on and how
 * many units of it. Unknown fields are rejected, and the quantity must be
 * a whole number of at least 0 sent as a number.
 *
 * @example
 * ```typescript
 * import { AddonCartItemSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, item] = AddonCartItemSchemaObject.safeParse({
 *   addon_id: 'adn_seats',
 *   quantity: 3,
 * });
 * ```
 */
export const AddonCartItemSchemaObject: BaseGuardian<AddonCartItemSchema> =
  Guardian.object({
    addon_id: Guardian.string().notEmpty('`addon_id` is required'),
    quantity: Guardian.number().strict().integer().min(
      0,
      '`quantity` cannot be negative',
    ),
  }).strict().describe({
    title: 'Add-on cart item',
    description: 'One add-on and its quantity, sent with a subscription.',
  });

/** Type definition for {@link CreateAddonRequestSchemaObject}. */
export type CreateAddonRequestSchema = {
  /** Display name. */
  name: string;
  /** Amount charged each billing cycle, in the currency's smallest unit. */
  price: number;
  /** ISO 4217 code, uppercase, e.g. `USD`. */
  currency: string;
  tax_category: TaxCategorySchema;
  /** At most 1000 characters. */
  description?: string | null;
};

const minorUnits = () =>
  Guardian.number().strict().integer().min(
    0,
    '`price` must be a non-negative amount in minor units',
  );
const currencyCode = () =>
  Guardian.string().pattern(
    /^[A-Z]{3}$/,
    '`currency` must be an uppercase ISO 4217 code, e.g. USD',
  );
const description = () =>
  Guardian.string().maxLength(
    1000,
    '`description` must be at most 1000 characters',
  ).nullable().optional();

/**
 * Schema for `POST /addons`. Unknown fields are rejected, and numbers must
 * not arrive as strings.
 *
 * @example
 * ```typescript
 * import { CreateAddonRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = CreateAddonRequestSchemaObject.safeParse({
 *   name: 'Extra seat',
 *   price: 500, // $5.00 each cycle
 *   currency: 'USD',
 *   tax_category: 'saas',
 * });
 * ```
 */
export const CreateAddonRequestSchemaObject: BaseGuardian<
  CreateAddonRequestSchema
> = Guardian.object({
  name: Guardian.string().notEmpty('`name` is required'),
  price: minorUnits(),
  currency: currencyCode(),
  tax_category: TaxCategorySchemaObject,
  description: description(),
}).strict().describe({
  title: 'Create add-on request',
  description: 'Body for POST /addons.',
});

/**
 * Type definition for {@link UpdateAddonRequestSchemaObject}. Every field
 * is optional and an omitted field is left as it is.
 */
export type UpdateAddonRequestSchema = {
  /** At most 100 characters. Dodo does not document what `null` does. */
  name?: string | null;
  /** Minor units. Dodo does not document what `null` does. */
  price?: number | null;
  /** Dodo does not document what `null` does. */
  currency?: string | null;
  /** Dodo does not document what `null` does. */
  tax_category?: TaxCategorySchema | null;
  /** At most 1000 characters. Dodo does not document what `null` does. */
  description?: string | null;
  /**
   * The id (a UUID) of an image already uploaded to Dodo. `null` removes
   * the add-on's image; omitting it keeps the image.
   */
  image_id?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schema for `PATCH /addons/{id}`. An empty update is rejected locally,
 * since it would be a request that changes nothing.
 *
 * @example
 * ```typescript
 * import { UpdateAddonRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = UpdateAddonRequestSchemaObject.safeParse({
 *   name: 'Extra seat (annual)',
 *   image_id: null, // remove the image
 * });
 * ```
 */
export const UpdateAddonRequestSchemaObject: BaseGuardian<
  UpdateAddonRequestSchema
> = Guardian.object({
  name: Guardian.string().notEmpty('`name` cannot be blank').maxLength(
    100,
    '`name` must be at most 100 characters',
  ).nullable().optional(),
  price: minorUnits().nullable().optional(),
  currency: currencyCode().nullable().optional(),
  tax_category: TaxCategorySchemaObject.nullable().optional(),
  description: description(),
  image_id: Guardian.string().pattern(UUID, '`image_id` must be a UUID')
    .nullable().optional(),
}).strict().refine(
  (update) => Object.values(update).some((value) => value !== undefined),
  'an update must change at least one field',
).describe({
  title: 'Update add-on request',
  description: 'Body for PATCH /addons/{id}.',
}) as unknown as BaseGuardian<UpdateAddonRequestSchema>;

/** Type definition for {@link AddonSchemaObject}. */
export type AddonSchema = {
  id: string;
  business_id: string;
  name: string;
  /**
   * One of the `TAX_CATEGORIES`; typed as a string, as on a product, so a
   * new category never fails a read.
   */
  tax_category: string;
  /** Amount charged each billing cycle, in the currency's smallest unit. */
  price: number;
  currency: string;
  created_at: string;
  updated_at: string;
  description?: string | null;
  /** URL of the add-on's image. */
  image?: string | null;
};

/**
 * Schema for an add-on record, from `POST /addons`, `PATCH /addons/{id}`
 * and each entry of `GET /addons`. Unknown fields pass through.
 *
 * @example
 * ```typescript
 * import { AddonSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, addon] = AddonSchemaObject.safeParse({
 *   id: 'adn_1',
 *   business_id: 'biz_1',
 *   name: 'Extra seat',
 *   tax_category: 'saas',
 *   price: 500,
 *   currency: 'USD',
 *   created_at: '2026-01-01T00:00:00Z',
 *   updated_at: '2026-01-01T00:00:00Z',
 * });
 * ```
 */
export const AddonSchemaObject: BaseGuardian<AddonSchema> = Guardian.object({
  id: Guardian.string(),
  business_id: Guardian.string(),
  name: Guardian.string(),
  tax_category: Guardian.string(),
  price: Guardian.number().integer(),
  currency: Guardian.string(),
  created_at: Guardian.string(),
  updated_at: Guardian.string(),
  description: Guardian.string().nullable().optional(),
  image: Guardian.string().nullable().optional(),
}).passthrough().describe({
  title: 'Add-on',
  description: 'An add-on record.',
});

/** Type definition for {@link AddonListSchemaObject}. */
export type AddonListSchema = {
  items: AddonSchema[];
};

/**
 * Schema for a page of add-ons. An absent `items` normalizes to an empty
 * array.
 *
 * @example
 * ```typescript
 * import { AddonListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = AddonListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const AddonListSchemaObject: BaseGuardian<AddonListSchema> = Guardian
  .preprocess(
    (raw: unknown) => {
      // A bare array is the items themselves, as for the other list pages.
      if (Array.isArray(raw)) return { items: raw };
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { ...obj, items: obj.items ?? [] };
    },
    Guardian.object({
      items: Guardian.array(AddonSchemaObject),
    }).passthrough().describe({
      title: 'Add-on list page',
      description: 'One page of GET /addons results.',
    }),
  );
