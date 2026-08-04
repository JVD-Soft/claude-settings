#!/usr/bin/env node
/**
 * Structural validation of every plugin in this marketplace.
 *
 * Exists because the failure it catches is silent: malformed frontmatter does
 * not raise an error — Claude Code loads the skill body with empty metadata, so
 * `/skill-name` still works while the model has no description to match
 * against. The skill simply stops activating on its own and nobody notices.
 *
 * Deliberately not `claude plugin validate`: that needs the CLI installed and
 * signed in. This runs on bare Node, so it can gate every push. Run the
 * official validator too when a CI credential exists — it is a complement, not
 * a substitute.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const exists = (file) => {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
};

/** Frontmatter only — enough to check the fields, without a YAML dependency. */
const frontmatter = (file) => {
  const text = readFileSync(file, 'utf8');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return null;

  const fields = {};
  let key = null;
  for (const line of text.slice(4, end).split('\n')) {
    const match = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (match?.[1]) {
      key = match[1];
      fields[key] = match[2] ?? '';
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item?.[1] && key) {
      fields[key] = Array.isArray(fields[key]) ? [...fields[key], item[1]] : [item[1]];
    }
  }
  return fields;
};

// Limits the docs state outright.
const NAME_RULE = /^[a-z0-9-]+$/;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const RESERVED = ['anthropic', 'claude'];

const checkName = (where, name) => {
  if (!name) return fail(where, 'missing `name`');
  if (name.length > NAME_MAX) fail(where, `name is ${name.length} chars, max ${NAME_MAX}`);
  if (!NAME_RULE.test(name)) fail(where, `name "${name}" must be lowercase letters, digits, hyphens`);
  // A colon is reserved for plugin-scoped identifiers; a file whose name
  // contains one is not loaded at all.
  if (name.includes(':')) fail(where, 'name contains ":", which is reserved');
  for (const word of RESERVED) {
    if (name.includes(word)) fail(where, `name contains the reserved word "${word}"`);
  }
};

const checkDescription = (where, description) => {
  if (!description) return fail(where, 'missing `description` — without it the model cannot match the component');
  if (description.length > DESCRIPTION_MAX) {
    fail(where, `description is ${description.length} chars, max ${DESCRIPTION_MAX}`);
  }
};

// --- marketplace ------------------------------------------------------------

const marketplaceFile = path.join(root, '.claude-plugin/marketplace.json');
if (!exists(marketplaceFile)) {
  fail('.claude-plugin/marketplace.json', 'missing');
} else {
  const marketplace = readJson(marketplaceFile);
  if (!marketplace.name) fail('marketplace.json', 'missing `name`');
  if (!Array.isArray(marketplace.plugins)) fail('marketplace.json', '`plugins` must be an array');

  for (const entry of marketplace.plugins ?? []) {
    const dir = path.join(root, entry.source);
    if (!exists(dir)) fail(`marketplace.json → ${entry.name}`, `source ${entry.source} does not exist`);
  }

  // --- each plugin ----------------------------------------------------------

  for (const entry of marketplace.plugins ?? []) {
    const dir = path.join(root, entry.source);
    if (!exists(dir)) continue;
    const label = entry.name;

    const manifestFile = path.join(dir, '.claude-plugin/plugin.json');
    if (!exists(manifestFile)) {
      fail(label, '.claude-plugin/plugin.json missing');
      continue;
    }
    const manifest = readJson(manifestFile);
    checkName(`${label}/plugin.json`, manifest.name);
    checkDescription(`${label}/plugin.json`, manifest.description);
    if (manifest.name !== entry.name) {
      fail(label, `plugin.json name "${manifest.name}" differs from the marketplace entry "${entry.name}"`);
    }
    // Without a version bump a push reaches nobody — Claude Code sees the same
    // string and keeps the cached copy.
    if (!manifest.version) warn(label, 'no `version`: every commit counts as a release');

    // Components must sit at the plugin root, never inside .claude-plugin.
    const inside = readdirSync(path.join(dir, '.claude-plugin'));
    const strays = inside.filter((name) => name !== 'plugin.json');
    if (strays.length > 0) {
      fail(label, `.claude-plugin must hold only plugin.json, found: ${strays.join(', ')}`);
    }

    const skillNames = new Set();
    const skillsDir = path.join(dir, 'skills');
    if (exists(skillsDir)) {
      for (const name of readdirSync(skillsDir)) {
        const file = path.join(skillsDir, name, 'SKILL.md');
        if (!exists(file)) {
          fail(`${label}/skills/${name}`, 'SKILL.md missing');
          continue;
        }
        const fields = frontmatter(file);
        if (!fields) {
          fail(`${label}/skills/${name}`, 'frontmatter missing or unterminated — the skill would load with empty metadata and never self-activate');
          continue;
        }
        skillNames.add(`${manifest.name}:${fields.name ?? name}`);
        checkDescription(`${label}/skills/${name}`, fields.description);
        if (fields.name) checkName(`${label}/skills/${name}`, fields.name);

        // The docs put the body limit at 500 lines; past that, split into
        // reference files one level deep.
        const lines = readFileSync(file, 'utf8').split('\n').length;
        if (lines > 500) warn(`${label}/skills/${name}`, `SKILL.md is ${lines} lines, over the 500-line guidance`);
      }
    }

    const agentsDir = path.join(dir, 'agents');
    if (exists(agentsDir)) {
      for (const name of readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
        const fields = frontmatter(path.join(agentsDir, name));
        if (!fields) {
          fail(`${label}/agents/${name}`, 'frontmatter missing or unterminated');
          continue;
        }
        checkName(`${label}/agents/${name}`, fields.name);
        checkDescription(`${label}/agents/${name}`, fields.description);

        // Plugin agents are the lowest of five precedence levels: an unprefixed
        // name is silently overridden by any same-named file in a project.
        if (fields.name && !fields.name.startsWith('jvd-')) {
          fail(`${label}/agents/${name}`, `name "${fields.name}" is unprefixed — a project agent of the same name silently wins`);
        }

        for (const skill of Array.isArray(fields.skills) ? fields.skills : []) {
          if (!skillNames.has(skill)) {
            fail(`${label}/agents/${name}`, `preloads "${skill}", which no skill in this plugin provides`);
          }
        }
      }
    }

    for (const file of ['hooks/hooks.json', '.mcp.json', 'settings.json']) {
      const full = path.join(dir, file);
      if (exists(full)) readJson(full);
    }
  }
}

for (const message of warnings) console.warn(`warn  ${message}`);
for (const message of errors) console.error(`FAIL  ${message}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`ok - marketplace and plugins valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
