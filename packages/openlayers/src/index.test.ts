import { describe, expect, it } from 'vitest';
import * as adapter from './index.js';

describe('@kinesisjs/openlayers', () => {
  it('exports VERSION constant', () => {
    expect(adapter.VERSION).toBe('0.1.0');
  });
});
