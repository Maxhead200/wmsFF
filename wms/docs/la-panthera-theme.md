# la_panthera

Opt-in web theme inspired by https://unitool.ai/ru/x-ai: graphite canvas, dark panels, subtle outlines, violet accents and high-contrast text. Existing navigation, section order and grid definitions are retained. No auto-selection for any user.

Font: bundled InterVariable.woff2, family La Panthera Inter, with Segoe UI/sans-serif fallback. Licensed under SIL OFL1.1; license bundled in public/fonts/inter. Source: https://github.com/rsms/inter/tree/master/docs/font-files. No third-party font requests. Body15px, table/navigation/card descriptions14px. Styles apply only to screen media, including portaled dialogs; labels and exported files retain their format.

Files: App.tsx (option and union), main.tsx (stylesheet import), components/layout/la-panthera-theme.css, test/la-panthera-theme.browser.cjs. API, Android and sold WMS are unchanged. Existing localStorage stores the selection per user.

Validation: browser checks actual shared CSS plus new theme for isolation, dark controls/dialogs, focus, screen-only styles and font readability; layout-changing CSS declarations are rejected. Fixture is a component sample, not an authenticated full-screen production test. Existing narrow-screen layout is retained. TypeScript and web tests run locally. Source/runtime parity is still false; publication requires a fresh runtime capture and surgical web delta, never a full local build over production.

Branch: feature/la-panthera-theme. Proposed PR target: feature/wb-print-check. Published through PR374 on our WMS; web only.


## Operational contrast correction

Scope: la_panthera screen CSS only. Requests/online execution, KIZ circulation, logistics, external API, web TSD monitoring, service, administration, order assembly, FBS, warehouse search, inventory, contract forms and printing controls now use dark surfaces. Product name in monitoring wraps instead of ellipsis. Solid light data text, blue-violet/magenta nested navigation, distinct magenta sidebar icons and light-blue labels; restrained forest-green information panels. #C154C1 is used for icons; its gradient endpoint under small white text is darkened to #AD4BAD to retain at least 4.5:1 contrast. Label artwork and print media remain separate.

Regression: test/la-panthera-contrast.browser.cjs loads actual feature styles after theme CSS, optionally captured runtime styles via RUNTIME_CSS. Thirteen representative views, including contract forms, normal/active/disabled controls, dark backgrounds, text contrast, long product wrapping, sidebar colours and print exclusion. Original published CSS fails this test. Fixtures are not an authenticated production UI walkthrough.

Release: CSS + index link only over freshly captured web. Docker's existing 419-layer image hit its mount-path limit; flattened base verified with identical image config and all 3076 filesystem entries (content, links, mode and ownership). Runtime JavaScript, API, APK and deployment settings remain unchanged by this release. Full local web281/API2883 tests pass; 114 API cases skipped, dedicated KIZ database suite excluded as in existing release process.

FBS entry header and nested menu/client list use dark semantic accents for all six variants. Approved marketplace outer tiles are retained.
