---
'@kinesisjs/maplibre': patch
---

Fix the custom-sprite example in the docs.

It used `await map.loadImage(url)`, which only returns a promise from
maplibre-gl v4 onward — in v3 the method is callback-based, and this package's
peer range allows `>=3.0.0`, so the example did not hold for every supported
version. It now loads the image with `new Image()` + `decode()`, which behaves
the same on all of them.

Documentation only; no change to the adapter.
