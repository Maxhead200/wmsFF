# Our WMS navigation regrouping

Scope: our host only; no API, permissions, billing calculations, TSD or sold WMS changes.
Seven Soul groups: client, marketplaces, operations, management, control, logistics, finance.
Monitoring and API WMS are separate entries in management. Unlisted entries retain their old groups.
Navigation consumes already-authorized items without changing their objects or access checks.
Soul title is red/bold with LOGOff underlined; desktop/tablet rectangles retain equal dimensions.

Source: App.groupWorkspaces, lib/workspace-groups, SoulWorkspace, soul-theme.css.
Release: bounded pinned runtime navigation replacement plus compiled Soul adapter, additive web overlay.
Source parity is still unverified: do not deploy a full rebuild.
Base web: f5c753588ac493d670144c5adec5b11fdc98b8af64e1ca65ed301c373f22935a.
API remains a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62.
Rollback: logoff-web:before-menu-groups-20260929.

Checks: regrouping tests red before/green after, 315 web tests/59 files,
TypeScript noEmit, browser navigation at 1440/1024/390px (35 entries, seven groups,
equal card sizes, keyboard, no horizontal overflow, saved page state, light/dark heading),
release entry hash guard and exact runtime grouping evaluation.
