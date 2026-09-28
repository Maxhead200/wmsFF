# la_panthera

Opt-in web theme inspired by https://unitool.ai/ru/x-ai: graphite canvas, dark panels, subtle outlines, violet accents and high-contrast text. Existing navigation, section order and grid definitions are retained. No auto-selection for any user.

Font: bundled InterVariable.woff2, family La Panthera Inter, with Segoe UI/sans-serif fallback. Licensed under SIL OFL1.1; license bundled in public/fonts/inter. Source: https://github.com/rsms/inter/tree/master/docs/font-files. No third-party font requests. Body15px, table/navigation/card descriptions15px. Styles apply only to screen media, including portaled dialogs; labels and exported files retain their format.

Files: App.tsx (option and union), main.tsx (stylesheet import), components/layout/la-panthera-theme.css, test/la-panthera-theme.browser.cjs. API, Android and sold WMS are unchanged. Existing localStorage stores the selection per user.

Validation: browser checks actual shared CSS plus new theme for isolation, dark controls/dialogs, focus, screen-only styles and font readability; layout-changing CSS declarations are rejected. Fixture is a component sample, not an authenticated full-screen production test. Existing narrow-screen layout is retained. TypeScript and web tests run locally. Source/runtime parity is still false; publication requires a fresh runtime capture and surgical web delta, never a full local build over production.

Branch: feature/la-panthera-theme. Proposed PR target: feature/wb-print-check. Published through PR374 on our WMS; web only.


## Operational contrast correction

Scope: la_panthera screen CSS only. Requests/online execution, KIZ circulation, logistics, external API, web TSD monitoring, service, administration, order assembly, FBS, warehouse search, inventory, contract forms and printing controls now use dark surfaces. Product name in monitoring wraps instead of ellipsis. Solid light data text, blue-violet/magenta nested navigation, distinct magenta sidebar icons and light-blue labels; restrained forest-green information panels. #C154C1 is used for icons; its gradient endpoint under small white text is darkened to #AD4BAD to retain at least 4.5:1 contrast. Label artwork and print media remain separate.

Regression: test/la-panthera-contrast.browser.cjs loads actual feature styles after theme CSS, optionally captured runtime styles via RUNTIME_CSS. Seventeen representative views, including contract forms, normal/active/disabled controls, dark backgrounds, text contrast, long product wrapping, sidebar colours and print exclusion. Original published CSS fails this test. Fixtures are not an authenticated production UI walkthrough.

Release: CSS + index link only over freshly captured web. Docker's existing 419-layer image hit its mount-path limit; flattened base verified with identical image config and all 3076 filesystem entries (content, links, mode and ownership). Runtime JavaScript, API, APK and deployment settings remain unchanged by this release. Full local web281/API2891 tests pass; 113 API cases skipped, dedicated KIZ database suite excluded as in existing release process.

FBS entry header and nested menu/client list use dark semantic accents for all six variants. Approved marketplace outer tiles are retained.

Payroll: dark controls, summary border 1px / inset 8px; LOGOFF WMS wordmark #F80000.

Branch icons and captions: dark surfaces. Theme/user names: #F80000 by owner request.

Today dashboard: dark rows, saturated icons, matching gradients, 14px descriptions and 22px metrics.


## Complete module coverage and navigation hover

47 module stylesheets are scanned by `test/build-la-panthera-coverage.cjs`; generated screen-only literal colour and small-font overrides are scoped to la_panthera. The generated selector manifest is `test/la-panthera-coverage.json`. Hand-tuned rules follow the generated block. Print media, preview artwork and other themes are excluded. Runtime CSS is also loaded in the regression fixtures to catch cascade differences.

26 representative component views cover the reported screens, including expenses, pricing, payroll editor, access, inventory journals, regional analytics and order details. Contrast >=4.5:1, dark surfaces, thin frames, readable typography and print isolation are checked. This is not an authenticated walkthrough of every populated production screen.

Navigation tiles and sidebar buttons scale to 1.02 with a dark red gradient on mouse hover. Transforms preserve neighbouring layout; reduced-motion disables scaling and transitions. Payroll editor inline white background is overridden and grid content stops stretching controls.

New tests: `node test/la-panthera-hover.browser.cjs`; generated coverage validation: `node test/build-la-panthera-coverage.cjs --check`. PR target feature/wb-print-check. Deployment uses fresh production web with only index.html and a versioned la_panthera CSS delta; parallel spirit release is preserved. API, Android, sold WMS and business operations unchanged.


## Original panther loading indicator

The 85×41 transparent GIF (19 frames, 10,327 bytes) is extracted byte-for-byte from the user-provided diploma PPT Pictures stream. `public/animations/panther-still.png` is its first frame for reduced-motion. `la-panthera-loader.css` decorates existing loading classes and aria-busy states; it does not intercept requests or change their lifecycle. The small fixed silhouette is inverted for dark backgrounds, ignores pointer events and is excluded from print/other themes. States without existing loading markers are outside this CSS integration.

Regression: `test/la-panthera-loader.browser.cjs` verifies lifecycle, busy state, disabled/error exclusion, reduced-motion, print and other-theme isolation. Supply groups also have a three-variant contrast fixture: opaque dark controls and warehouse badges, graphite heading and thin green accent; disabled actions remain disabled.
