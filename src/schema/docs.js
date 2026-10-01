// @ts-check
/**
 * Generates the parameter reference (Markdown) from a schema, grouped like the inspector.
 * Used for docs/parameters.md and the in-app help page.
 */

/** @typedef {import('./schema.js').ParamDef} ParamDef */

/** @param {ParamDef} def */
function describeRange(def) {
  const unit = def.unit ? ` ${def.unit}` : '';
  switch (def.type) {
    case 'float':
    case 'int':
      return `${def.min}–${def.max}${unit}`;
    case 'enum':
      return (def.options ?? []).map((o) => `\`${o.value}\``).join(', ');
    case 'curve':
      return `y ${def.yMin}–${def.yMax}`;
    default:
      return '';
  }
}

/** @param {ParamDef} def */
function describeDefault(def) {
  if (def.type === 'ramp') return def.default.map((/** @type {any} */ s) => s.color).join(' → ');
  if (def.type === 'curve') return `${def.default.length} points`;
  return `\`${JSON.stringify(def.default)}\``;
}

/** @param {ParamDef} def */
function describeRandomize(def) {
  const r = def.randomize;
  if (r === undefined) return '';
  if (r === true) return 'any';
  if ('chance' in r) return `${Math.round(r.chance * 100)}% on`;
  if ('options' in r) return r.options.join(', ');
  return `${r.min}–${r.max}`;
}

const cell = (/** @type {string} */ s) => String(s).replaceAll('|', '\\|');

/**
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {string} [title='Parameters']
 * @returns {string} Markdown
 */
export function generateParamDocs(schema, title = 'Parameters') {
  /** @type {Map<string, ParamDef[]>} */
  const groups = new Map();
  for (const def of schema) {
    if (!groups.has(def.group)) groups.set(def.group, []);
    groups.get(def.group)?.push(def);
  }
  const lines = [`# ${title}`, ''];
  for (const [group, defs] of groups) {
    lines.push(`## ${group}`, '');
    lines.push('| Parameter | Type | Range | Default | Variant range | Description |');
    lines.push('|---|---|---|---|---|---|');
    for (const def of defs) {
      lines.push(
        `| **${cell(def.label)}** \`${def.id}\` | ${def.type} | ${cell(describeRange(def))} | ${cell(
          describeDefault(def),
        )} | ${cell(describeRandomize(def))} | ${cell(def.tooltip ?? '')} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
