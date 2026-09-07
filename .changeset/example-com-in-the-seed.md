---
"@deevy/server": patch
---

The seeded Workspace's fabricated people and its Allowlist rule are at `example.com`, whatever
`DEEVY_ADMIN_EMAIL` is. The seed used to take the domain from the admin's own address, which put a real
domain on a screen every screenshot and demo shows. The admin still signs in as themselves; only the
fiction moved. Reseed with `--force` to pick it up, and restart the server afterwards — `--force` unlinks
the database file, and a running server keeps serving the one it already has open.
