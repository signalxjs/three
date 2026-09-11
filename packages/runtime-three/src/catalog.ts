/**
 * The element catalog: which JSX tag constructs which three.js class.
 *
 * An explicit `extend()` registry rather than a dynamic lookup on the `three`
 * namespace, so this package never imports `* as THREE` (that would retain
 * the whole library in every bundle). `@sigx/three` registers the full
 * namespace once for batteries-included use; tree-shaking-critical apps
 * register only what they render.
 */
import type { ThreeConstructor } from './node.js';
import { sigxThreeError } from './utils.js';

const registry = new Map<string, ThreeConstructor>();

/**
 * three.js classes whose lowerFirst name is also a DOM/SVG element that
 * `@sigx/runtime-dom` declares in the same global `JSX.IntrinsicElements`.
 * Both renderers can be loaded in one app (`<Canvas>` inside a DOM tree), so
 * these get a `three` prefix: `<threeLine>`, `<threeAudio>`, `<threePath>`,
 * `<threeSource>`. `lineSegments`, `lineLoop`, `positionalAudio` and
 * `audioListener` are unaffected.
 */
export const DOM_COLLISIONS: ReadonlySet<string> = new Set(['line', 'audio', 'path', 'source']);

/** The reserved tag for `<primitive object={…}>`. */
export const PRIMITIVE_TAG = 'primitive';

/** Lower-first a class name into its JSX tag, applying the DOM-collision prefix. */
export function tagNameFor(className: string): string {
    const tag = className.charAt(0).toLowerCase() + className.slice(1);
    return DOM_COLLISIONS.has(tag) ? `three${className}` : tag;
}

function isClassName(key: string): boolean {
    const c = key.charAt(0);
    return c !== c.toLowerCase();
}

/**
 * Register three.js classes as JSX elements.
 *
 * Keys that start with an uppercase letter are class names and register under
 * their lowerFirst tag (`{ Mesh }` → `<mesh>`, `{ Line }` → `<threeLine>`).
 * Lowercase keys are taken verbatim as explicit tag names
 * (`{ orbitControls: OrbitControls }` → `<orbitControls>`).
 *
 * Non-function values are ignored, so `extend(THREE)` over the whole namespace
 * is fine.
 */
export function extend(objects: Record<string, unknown>): void {
    for (const key in objects) {
        const ctor = objects[key];
        if (typeof ctor !== 'function') continue;
        let tag: string;
        if (isClassName(key)) {
            tag = tagNameFor(key);
        } else {
            if (__DEV__ && DOM_COLLISIONS.has(key)) {
                throw sigxThreeError(
                    `extend(): "${key}" is a DOM element name and cannot be a three.js JSX tag ` +
                    `(both renderers share one JSX table). Register it as <three${key.charAt(0).toUpperCase()}${key.slice(1)}> ` +
                    `by passing the class under its own name, e.g. extend({ ${key.charAt(0).toUpperCase()}${key.slice(1)} }).`
                );
            }
            tag = key;
        }
        registry.set(tag, ctor as ThreeConstructor);
    }
}

/** Whether a tag has been registered (or is the reserved `primitive`). */
export function isRegistered(tag: string): boolean {
    return tag === PRIMITIVE_TAG || registry.has(tag);
}

/** Resolve a tag to its constructor. Throws a descriptive error on a miss. */
export function resolveConstructor(tag: string): ThreeConstructor {
    const ctor = registry.get(tag);
    if (ctor !== undefined) return ctor;
    throw unknownTagError(tag);
}

/**
 * Common HTML/SVG tag names, used only to turn "unknown element" into the
 * more useful "a DOM element cannot render inside a three.js scene".
 */
const DOM_TAGS: ReadonlySet<string> = new Set([
    'a', 'abbr', 'article', 'aside', 'b', 'body', 'br', 'button', 'canvas', 'caption', 'circle',
    'code', 'col', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'ellipse', 'fieldset',
    'figure', 'footer', 'form', 'g', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr',
    'html', 'i', 'iframe', 'img', 'input', 'label', 'legend', 'li', 'main', 'nav', 'ol', 'option',
    'p', 'polygon', 'polyline', 'pre', 'progress', 'rect', 'section', 'select', 'small', 'span',
    'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template',
    'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'u', 'ul', 'video'
]);

function unknownTagError(tag: string): Error {
    if (DOM_TAGS.has(tag)) {
        return sigxThreeError(
            `<${tag}> is a DOM element and cannot render inside a three.js scene ` +
            `(under <Canvas> or a createRoot() tree). Move it outside the <Canvas>.`
        );
    }
    const className = tag.charAt(0).toUpperCase() + tag.slice(1);
    return sigxThreeError(
        `Unknown element <${tag}>. Register the three.js class with ` +
        `extend({ ${className} }) — @sigx/three does this for the whole three namespace.`
    );
}

/** @internal test seam */
export function clearCatalog(): void {
    registry.clear();
}
