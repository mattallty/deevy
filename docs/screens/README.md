# Screens

Every screen of the SPA, taken from a seeded local instance by `vp run web#screens`
(`apps/web/scripts/screens.ts`): the Google Chrome installed on the machine, headless, driven over the
DevTools protocol, signed in through the development GitHub stub as `DEEVY_ADMIN_EMAIL`. Desktop shots
are 1280×800, `*-dark` the same in the dark theme, `*-phone` 390×844.

To regenerate: run the `dev:stub` launch configuration and seed it (`docs/DEVELOPMENT.md`, "Running
without an OAuth App"), then `vp run web#screens`. `DEEVY_SCREENS_ONLY=issue,inbox-phone` takes some
shots alone; `DEEVY_SCREENS_DEBUG=1` prints what each page said at capture. Regenerate at a milestone,
not per commit: the set is about 1.7 MB each time.
