# la_panthera

Opt-in web theme inspired by https://unitool.ai/ru/x-ai: graphite canvas, dark panels, subtle outlines, violet accents and high-contrast text. Existing navigation, section order and grid definitions are retained. No auto-selection for any user.

Font: bundled InterVariable.woff2, family La Panthera Inter, with Segoe UI/sans-serif fallback. Licensed under SIL OFL1.1; license bundled in public/fonts/inter. Source: https://github.com/rsms/inter/tree/master/docs/font-files. No third-party font requests. Body15px, table/navigation/card descriptions14px. Styles apply only to screen media, including portaled dialogs; labels and exported files retain their format.

Files: App.tsx (option and union), main.tsx (stylesheet import), components/layout/la-panthera-theme.css, test/la-panthera-theme.browser.cjs. API, Android and sold WMS are unchanged. Existing localStorage stores the selection per user.

Validation: browser checks actual shared CSS plus new theme for isolation, dark controls/dialogs, focus, screen-only styles and font readability; layout-changing CSS declarations are rejected. Fixture is a component sample, not an authenticated full-screen production test. Existing narrow-screen layout is retained. TypeScript and web tests run locally. Source/runtime parity is still false; publication requires a fresh runtime capture and surgical web delta, never a full local build over production.

Branch: feature/la-panthera-theme. Proposed PR target: feature/wb-print-check. Not published.
