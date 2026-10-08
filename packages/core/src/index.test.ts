import { describe, expect, it } from 'vitest';
import * as core from './index.js';

import pkg from '../package.json';

describe('@kinesisjs/core', () => {
  it('exports VERSION constant', () => {
    expect(core.VERSION).toBe(pkg.version);
  });
});
