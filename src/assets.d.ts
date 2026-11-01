// SPDX-License-Identifier: Apache-2.0
/** Build-time asset imports (scripts/build.mjs loaders: svg as text, png as base64). */
declare module '*.svg' { const text: string; export default text }
declare module '*.png' { const base64: string; export default base64 }
