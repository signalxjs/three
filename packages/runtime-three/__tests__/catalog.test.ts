import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { extend, tagNameFor } from '@sigx/runtime-three';
import { clearCatalog, DOM_COLLISIONS, isRegistered, resolveConstructor } from '@sigx/runtime-three/internals';

describe('catalog', () => {
    it('lowerFirsts class names into tags', () => {
        expect(tagNameFor('Mesh')).toBe('mesh');
        expect(tagNameFor('MeshStandardMaterial')).toBe('meshStandardMaterial');
        expect(tagNameFor('BoxGeometry')).toBe('boxGeometry');
    });

    it('prefixes the DOM-colliding names', () => {
        expect(tagNameFor('Line')).toBe('threeLine');
        expect(tagNameFor('Audio')).toBe('threeAudio');
        expect(tagNameFor('Path')).toBe('threePath');
        expect(tagNameFor('Source')).toBe('threeSource');
        expect(tagNameFor('LineSegments')).toBe('lineSegments');
        expect(tagNameFor('PositionalAudio')).toBe('positionalAudio');
    });

    it('extend() registers class names under their tag and explicit keys verbatim', () => {
        clearCatalog();
        extend({ Mesh: THREE.Mesh, Line: THREE.Line, orbitThing: THREE.Group, notAClass: 42 });
        expect(resolveConstructor('mesh')).toBe(THREE.Mesh);
        expect(resolveConstructor('threeLine')).toBe(THREE.Line);
        expect(resolveConstructor('orbitThing')).toBe(THREE.Group);
        expect(isRegistered('notAClass')).toBe(false);
        expect(isRegistered('primitive')).toBe(true);
    });

    it('rejects an explicit DOM-colliding tag in dev', () => {
        clearCatalog();
        expect(() => extend({ line: THREE.Line })).toThrow(/threeLine/);
    });

    it('explains an unknown tag and a DOM tag differently', () => {
        clearCatalog();
        expect(() => resolveConstructor('torusKnotGeometry')).toThrow(/extend\(\{ TorusKnotGeometry \}\)/);
        expect(() => resolveConstructor('div')).toThrow(/DOM element/);
    });

    it('no class in the three namespace produces a tag that collides with a DOM element', () => {
        // The set of DOM tags runtime-dom declares; a future three class whose
        // lowerFirst name lands here must be added to DOM_COLLISIONS.
        const domTags = new Set([
            'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote',
            'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist',
            'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption',
            'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr',
            'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map',
            'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output',
            'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search',
            'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
            'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr',
            'track', 'u', 'ul', 'var', 'video', 'wbr',
            'svg', 'circle', 'clipPath', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
            'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
            'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
            'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
            'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line',
            'linearGradient', 'marker', 'mask', 'metadata', 'mpath', 'path', 'pattern', 'polygon', 'polyline',
            'radialGradient', 'rect', 'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'tspan', 'use', 'view'
        ]);
        const collisions: string[] = [];
        for (const key of Object.keys(THREE)) {
            const value = (THREE as Record<string, unknown>)[key];
            if (typeof value !== 'function' || key.charAt(0) === key.charAt(0).toLowerCase()) continue;
            const tag = tagNameFor(key);
            if (domTags.has(tag)) collisions.push(`${key} → ${tag}`);
        }
        expect(collisions).toEqual([]);
        for (const name of DOM_COLLISIONS) expect(domTags.has(name)).toBe(true);
    });
});
