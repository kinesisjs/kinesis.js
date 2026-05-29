// @vitest-environment jsdom
// The wrapper transitively imports @kinesisjs/leaflet, and Leaflet references
// `window` at module load time — so even this export-surface check needs a DOM.
import { describe, expect, it } from 'vitest';
import * as wrapper from './index.js';

describe('@kinesisjs/angular', () => {
  it('exports VERSION constant', () => {
    expect(wrapper.VERSION).toBe('0.1.0');
  });
});
