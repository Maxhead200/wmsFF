# Soul personal quick access

Our WMS only. A panel between the home title and menu groups ranks up to eight
accessible sections by opening count, then recency. Empty history is explicitly
shown as empty, not invented popularity. Each user has a separate browser-local
storage key. Page transitions include search navigation; refresh and StrictMode
do not double-count. No API requests or cross-device sync are added.

Tiles are 114px wide and minimum 57px high (approximately 3cm by 1.5cm at normal
CSS scaling). They wrap on phones; longer titles may increase height for readability.
Permissions remain authoritative. Storage errors do not block page navigation.

Files: SoulWorkspace, SoulQuickAccess, soulUsage, soul-theme.css and tests.
Validation: unit tests fail before implementation; full web suite; TypeScript;
browser widths 1440/1024/390 with StrictMode, keyboard, ordering, persistence,
account switch, revoked permission, blocked storage and no horizontal overflow.
Release tests pin the entry and assert unchanged application prefix.

Deploy only the additive web overlay; source parity remains unverified.
Base: 914f67b740f22d4088977955f65966e407624ad2e21dd76bb0ea765ae3f39a40.
Rollback: logoff-web:before-soul-quick-20260929. API, TSD, sold WMS unchanged.
