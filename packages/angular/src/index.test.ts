import { describe, expect, it } from 'vitest';
import * as wrapper from './index.js';

import pkg from '../package.json';

describe('@kinesisjs/angular', () => {
  it('exports VERSION constant', () => {
    expect(wrapper.VERSION).toBe(pkg.version);
  });
});
