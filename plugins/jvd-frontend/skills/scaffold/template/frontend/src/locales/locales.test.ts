import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A missing translation key does not throw. i18next falls back to rendering the
 * key itself, so the user is shown `auth.login.title` where a sentence belongs —
 * in the language nobody on the team clicks through. Lint stays clean, the build
 * stays green, and nothing else looks at it. That is why "add the key to every
 * locale in the same change" has to be a test rather than a line in a router.
 *
 * Everything here reads the shipped JSON off disk, so it holds whatever the
 * bundle will actually contain, and locales are discovered from the directory
 * rather than listed: a third language is held to the same parity the day its
 * folder lands.
 *
 * Plurals are the reason this is not a plain key-set comparison. i18next picks a
 * suffix through `Intl.PluralRules`, and the categories differ per language —
 * English needs `_one`/`_other`, Ukrainian also needs `_few` and `_many`. Those
 * extra keys are correct, not drift, so parity is compared over *logical* keys
 * and the per-language forms get their own assertion.
 * https://www.i18next.com/translation-function/plurals
 */
const LOCALES_DIR = path.resolve(__dirname);

const onDisk = existsSync(LOCALES_DIR)
  ? readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

type Tree = { [key: string]: unknown };

const translationFile = (locale: string) => path.join(LOCALES_DIR, locale, 'translation.json');

const load = (locale: string): Tree => {
  const file = translationFile(locale);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Tree) : {};
};

/**
 * Dotted paths, so a key that is a string in one locale and an object in another
 * compares as two different paths instead of quietly matching.
 */
const flatten = (tree: Tree, prefix = ''): Map<string, unknown> => {
  const flat = new Map<string, unknown>();
  for (const [key, value] of Object.entries(tree)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nested, leaf] of flatten(value as Tree, dotted)) flat.set(nested, leaf);
    } else {
      flat.set(dotted, value);
    }
  }
  return flat;
};

/** The six suffixes i18next takes from `Intl.PluralRules`. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const splitPlural = (key: string) => {
  const match = PLURAL_SUFFIX.exec(key);
  const category = match?.[1];
  return category ? { base: key.slice(0, -(category.length + 1)), category } : null;
};

/**
 * Base key → the plural categories present for it.
 *
 * `_other` is what makes a key plural: i18next requires it for every language,
 * so a lone `step_one` with no `step_other` is a literal key that happens to end
 * in a suffix, not a plural — and must not be held to plural rules.
 */
const pluralBases = (keys: Map<string, unknown>): Map<string, Set<string>> => {
  const bases = new Map<string, Set<string>>();
  for (const key of keys.keys()) {
    const split = splitPlural(key);
    if (!split || !keys.has(`${split.base}_other`)) continue;
    const categories = bases.get(split.base) ?? new Set<string>();
    categories.add(split.category);
    bases.set(split.base, categories);
  }
  return bases;
};

/** What a translator owes per locale: plural forms collapse to their base. */
const logicalKeys = (keys: Map<string, unknown>): Set<string> => {
  const bases = pluralBases(keys);
  const logical = new Set<string>();
  for (const key of keys.keys()) {
    const split = splitPlural(key);
    logical.add(split && bases.has(split.base) ? split.base : key);
  }
  return logical;
};

/**
 * `{{name}}` interpolation placeholders. A translation that drops one loses the
 * value silently — the sentence still reads as a sentence, just without the
 * number or the name it was meant to carry.
 */
const placeholders = (value: unknown): string[] =>
  typeof value === 'string'
    ? [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
        .flatMap((match) => (match[1] ? [match[1]] : []))
        .sort()
    : [];

const trees = new Map(onDisk.map((locale) => [locale, flatten(load(locale))]));
const reference = onDisk[0] ?? '';
const referenceKeys = trees.get(reference) ?? new Map<string, unknown>();
const referenceLogical = logicalKeys(referenceKeys);

// A project on this stack without i18n has nothing to check; failing it would be
// a plugin-owned file failing a project for a choice the project is allowed.
describe.skipIf(onDisk.length === 0)('locales', () => {
  it('has more than one locale, so parity is a real assertion', () => {
    expect(onDisk.length).toBeGreaterThan(1);
  });

  it('has a translation.json in every locale directory', () => {
    const empty = onDisk.filter((locale) => !existsSync(translationFile(locale)));
    expect(empty, 'a locale directory i18next cannot load is dead weight').toEqual([]);
  });

  describe.each(onDisk.filter((locale) => locale !== reference))(`%s vs ${reference}`, (locale) => {
    const keys = trees.get(locale) ?? new Map<string, unknown>();
    const logical = logicalKeys(keys);

    it(`translates everything ${reference} says`, () => {
      const missing = [...referenceLogical].filter((key) => !logical.has(key));
      expect(missing, `${locale} is missing keys that ${reference} has`).toEqual([]);
    });

    it(`says nothing ${reference} does not`, () => {
      const extra = [...logical].filter((key) => !referenceLogical.has(key));
      expect(extra, `${locale} has keys ${reference} does not — one of the two was edited alone`).toEqual([]);
    });

    it('keeps the same interpolation placeholders per key', () => {
      const drifted = [...referenceKeys.entries()]
        .filter(([key]) => keys.has(key))
        .map(([key, value]) => ({
          key,
          expected: placeholders(value).join(', '),
          actual: placeholders(keys.get(key)).join(', '),
        }))
        .filter(({ expected, actual }) => expected !== actual)
        .map(({ key, expected, actual }) => `${key}: ${reference} interpolates [${expected}], ${locale} [${actual}]`);

      expect(drifted, 'a dropped placeholder renders the sentence without its value').toEqual([]);
    });
  });

  describe.each(onDisk)('%s', (locale) => {
    const keys = trees.get(locale) ?? new Map<string, unknown>();

    it('has every plural form this language selects, and no form it never selects', () => {
      // `_zero` is i18next's opt-in special case for count: 0 in any language,
      // so it is allowed on top of whatever Intl requires.
      // Widened at the boundary: `pluralCategories` is `LDMLPluralRule[]`, and the
      // categories read off the key names are plain strings.
      const required: string[] = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
      const problems: string[] = [];

      for (const [base, categories] of pluralBases(keys)) {
        const missing = required.filter((category) => !categories.has(category));
        const never = [...categories].filter(
          (category) => category !== 'zero' && !required.includes(category),
        );
        if (missing.length > 0) {
          problems.push(`${base}: no ${missing.map((c) => `_${c}`).join(', ')} — that count renders the key`);
        }
        if (never.length > 0) {
          problems.push(`${base}: has ${never.map((c) => `_${c}`).join(', ')}, which ${locale} never selects`);
        }
      }

      expect(problems, `${locale} selects: ${required.join(', ')}`).toEqual([]);
    });

    it('has no empty or whitespace-only value', () => {
      const blank = [...keys.entries()]
        .filter(([, value]) => typeof value === 'string' && value.trim() === '')
        .map(([key]) => key);
      expect(blank, 'an empty string renders as nothing, which reads as a layout bug').toEqual([]);
    });

    it('has every value a string', () => {
      const wrong = [...keys.entries()]
        .filter(([, value]) => typeof value !== 'string')
        .map(([key, value]) => `${key} is ${value === null ? 'null' : typeof value}`);
      expect(wrong, 'i18next renders a non-string leaf as the key itself').toEqual([]);
    });
  });
});
