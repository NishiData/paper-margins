# PDF.js 5.6.205

Upstream: https://github.com/mozilla/pdf.js/releases/tag/v5.6.205
Generic viewer distribution: https://github.com/mozilla/pdf.js/releases/download/v5.6.205/pdfjs-5.6.205-dist.zip
License: Apache-2.0 (see LICENSE).

The engine and the generic viewer use the same version. Source maps and the demo PDF are omitted. The viewer includes Japanese and English locales. Existing cmaps, standard_fonts and wasm directories are shared through viewer options.

Paper Margins changes to web/viewer.html: Japanese document language and links to the locally bundled Japanese font and ../../../pdf-viewer.css. web/locale/locale.json is limited to the two bundled locales. The upstream viewer.mjs and viewer.css are unmodified. Integration code lives outside this vendor directory.
