// @ts-check
/** Tiny DOM helper: create an element with properties, listeners and children. */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, any>} [props] @param {(Node|string)[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) /** @type {any} */ (el)[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}
