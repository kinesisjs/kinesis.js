# Security Policy

## Supported versions

Kinesis.js packages are independently versioned. Security fixes are released
against the **latest published version of each `@kinesisjs/*` package**. There
is no long-term support branch for older releases while the project is pre-1.0;
please upgrade to the current version to receive fixes.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Report privately through GitHub's
[**Report a vulnerability**](https://github.com/kinesisjs/kinesis.js/security/advisories/new)
form (Security → Advisories). If you cannot use GitHub advisories, email
**muh.muzafferaskar@gmail.com** with details.

Please include:

- affected package(s) and version(s),
- a description of the issue and its impact,
- reproduction steps or a minimal proof of concept, if possible.

You can expect an initial acknowledgement within **72 hours**. Once a fix is
ready, a patch release is published and the advisory is disclosed with credit to
the reporter (unless anonymity is requested).

## Scope

In scope: the published `@kinesisjs/*` packages (`core`, `openlayers`,
`leaflet`, `angular`, `route-aware`) and the build/release pipeline.

Out of scope: vulnerabilities in third-party map libraries (OpenLayers, Leaflet)
or routing backends (e.g. a self-hosted OSRM instance) — report those upstream.
The public OSRM demo endpoint referenced in `@kinesisjs/route-aware` docs is for
evaluation only; self-host for production.

## Security posture

- All packages are published to npm with
  [provenance](https://docs.npmjs.com/generating-provenance-statements) and
  signed via sigstore through OIDC Trusted Publishing — every release is
  cryptographically traceable to the GitHub Actions workflow that built it.
- GitHub Actions are pinned by commit SHA; workflow permissions follow
  least-privilege.
- The framework-agnostic core ships with zero runtime dependencies.
