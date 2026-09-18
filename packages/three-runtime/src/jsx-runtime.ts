/**
 * `jsxImportSource: "@sigx/three-runtime"` — for three-only apps (no DOM
 * renderer). Installs the platform identity and re-exports core's jsx
 * factory. DOM apps with `<Canvas>` keep `jsxImportSource: "sigx"` instead.
 */
import './platform.js';
import './jsx-types.js';
export { jsx, jsxs, jsxDEV, Fragment } from '@sigx/runtime-core';
