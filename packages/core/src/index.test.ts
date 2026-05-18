import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('@kinesisjs/core', () => {
  it('exports VERSION constant', () => {
    expect(core.VERSION).toBe('0.1.0');
  });
});
