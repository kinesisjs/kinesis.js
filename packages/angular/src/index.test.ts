import { describe, expect, it } from 'vitest';
import * as wrapper from './index.js';

describe('@kinesisjs/angular', () => {
  it('exports VERSION constant', () => {
    expect(wrapper.VERSION).toBe('0.1.0');
  });
});
