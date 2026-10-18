import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';

describe('t', () => {
  it('fills placeholders', () => {
    expect(t('autoReloadOff', { error: 'boom' })).toContain('boom');
  });

  it('returns text for every key used by the setup banner', () => {
    for (const key of ['setupTitle', 'setupBody', 'setupStep1', 'setupStep2', 'setupStep3', 'setupButton'] as const) {
      expect(t(key).length).toBeGreaterThan(0);
    }
  });
});
