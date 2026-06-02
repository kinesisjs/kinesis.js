# Installation

## Requirements

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (recommended) or npm ≥ 10

## Install from npm

Pick an adapter; everything else hangs off it.

OpenLayers:

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers ol
```

Leaflet:

```bash
pnpm add @kinesisjs/core @kinesisjs/leaflet leaflet
```

With the Angular wrapper (OpenLayers stack):

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular ol
```

Core only (you're writing your own adapter):

```bash
pnpm add @kinesisjs/core
```

## Peer dependencies

These are not bundled — your project supplies the version:

| Package                 | Peer                               | Range      |
| ----------------------- | ---------------------------------- | ---------- |
| `@kinesisjs/openlayers` | `ol`                               | `>=8.0.0`  |
| `@kinesisjs/leaflet`    | `leaflet`                          | `>=1.7.0`  |
| `@kinesisjs/angular`    | `@angular/core`, `@angular/common` | `>=17.0.0` |
| `@kinesisjs/angular`    | `rxjs`                             | `>=7.0.0`  |
| `@kinesisjs/angular`    | `ol`                               | `>=8.0.0`  |

## Local development (consuming a fork or unreleased branch)

If you want to consume the library from a checkout rather than npm — for example to test a fork or an unreleased branch — there are three options.

### `pnpm link`

```bash
git clone https://github.com/kinesisjs/kinesis.js
cd kinesis.js
pnpm install
pnpm build

cd packages/core        && pnpm link --global
cd ../openlayers        && pnpm link --global
cd ../angular           && pnpm link --global

cd /path/to/your-app
pnpm link --global @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular
```

### `file:` protocol

In your app's `package.json`:

```json
{
  "dependencies": {
    "@kinesisjs/core": "file:../kinesis.js/packages/core",
    "@kinesisjs/openlayers": "file:../kinesis.js/packages/openlayers",
    "@kinesisjs/angular": "file:../kinesis.js/packages/angular"
  }
}
```

Then run `pnpm install`.

### Tarball

```bash
cd packages/core && pnpm pack
# Produces kinesisjs-core-<version>.tgz

cd /path/to/your-app
pnpm add /path/to/kinesisjs-core-<version>.tgz
```

## Next steps

- [First map (Angular)](/guide/first-map-angular)
- [First map (vanilla TypeScript)](/guide/first-map-vanilla) — OpenLayers
- [First map (Leaflet)](/guide/first-map-leaflet)
