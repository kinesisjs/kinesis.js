import { describe, expect, it } from 'vitest';
import * as adapter from './index.js';

import pkg from '../package.json';

describe('@kinesisjs/openlayers', () => {
  it('exports VERSION constant', () => {
    expect(adapter.VERSION).toBe(pkg.version);
  });
});
