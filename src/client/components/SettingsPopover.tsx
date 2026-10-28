import React from 'react';
import type { Translate } from '../locales';
import { DEFAULT_READING, FOLLOW_STORAGE_KEY, type ReadingSettings } from '../types';

interface SettingsPopoverProps {
  reading: ReadingSettings;
  followWrites: boolean;
  onUpdateReading: (patch: Partial<ReadingSettings>) => void;
  onToggleFollowWrites: (next: boolean) => void;
  onRestoreDefaults: () => void;
  t: Translate;
}

export function SettingsPopover({
  reading,
  followWrites,
  onUpdateReading,
  onToggleFollowWrites,
  onRestoreDefaults,
  t,
}: SettingsPopoverProps) {
  return (
    <div className="md-live-settings" role="dialog" aria-label={t('doc.settings')}>
      <label className="md-live-settings-row">
        <span>{t('settings.fontSize')}</span>
        <select
          value={reading.fontSize === null ? '' : String(reading.fontSize)}
          onChange={(e) =>
            onUpdateReading({ fontSize: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">{t('settings.followApp')}</option>
          <option value="13">13px</option>
          <option value="14">14px</option>
          <option value="15">15px</option>
          <option value="16">16px</option>
          <option value="18">18px</option>
        </select>
      </label>
      <label className="md-live-settings-row">
        <span>{t('settings.lineHeight')}</span>
        <select
          value={reading.lineHeight === null ? '' : String(reading.lineHeight)}
          onChange={(e) =>
            onUpdateReading({ lineHeight: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">{t('settings.followApp')}</option>
          <option value="1.5">1.5</option>
          <option value="1.6">1.6</option>
          <option value="1.7">1.7</option>
          <option value="1.8">1.8</option>
          <option value="2">2.0</option>
        </select>
      </label>
      <label className="md-live-settings-row">
        <span>{t('settings.width')}</span>
        <select
          value={reading.width === null ? '' : String(reading.width)}
          onChange={(e) =>
            onUpdateReading({ width: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">{t('settings.followApp')}</option>
          <option value="640">640px</option>
          <option value="760">760px</option>
          <option value="900">900px</option>
        </select>
      </label>
      <label className="md-live-settings-row md-live-settings-check">
        <input
          type="checkbox"
          checked={followWrites}
          onChange={(e) => onToggleFollowWrites(e.target.checked)}
        />
        <span>{t('settings.followWrites')}</span>
      </label>
      <div className="md-live-settings-actions">
        <button className="md-live-btn" onClick={onRestoreDefaults}>
          {t('settings.restore')}
        </button>
      </div>
    </div>
  );
}
