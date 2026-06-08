import React from 'react';
import { getPricingFormulaLines } from '../lib/display.mjs';
import { sanitizeDecimalInput } from '../lib/validation.mjs';
import type { PricingProfile } from '../types/settings';

interface Props {
  profile: PricingProfile;
  onChange: (key: string, value: string) => void;
}

export default function PricingEditor({ profile, onChange }: Props) {
  const formulas = getPricingFormulaLines(profile);
  const handleNumberChange = (key: string, value: string) => {
    onChange(key, sanitizeDecimalInput(value));
  };

  return (
    <section className="settings-section">
      <h2>本地估算</h2>
      <div className="formula-note">
        <p>{formulas.money}</p>
        <p>{formulas.quota}</p>
      </div>
      <label>
        输入单价 / 1M
        <input
          value={profile.inputPricePerMillion}
          inputMode="decimal"
          onChange={(event) => handleNumberChange('inputPricePerMillion', event.currentTarget.value)}
        />
      </label>
      <label>
        缓存输入单价 / 1M
        <input
          value={profile.cachedInputPricePerMillion}
          inputMode="decimal"
          onChange={(event) => handleNumberChange('cachedInputPricePerMillion', event.currentTarget.value)}
        />
      </label>
      <label>
        输出单价 / 1M
        <input
          value={profile.outputPricePerMillion}
          inputMode="decimal"
          onChange={(event) => handleNumberChange('outputPricePerMillion', event.currentTarget.value)}
        />
      </label>
      <label>
        人民币 / 美元
        <input
          value={profile.cnyPerUsd}
          inputMode="decimal"
          onChange={(event) => handleNumberChange('cnyPerUsd', event.currentTarget.value)}
        />
      </label>
      <div className="ratio-row">
        <label>
          模型倍率
          <input
            value={profile.modelRatio}
            inputMode="decimal"
            onChange={(event) => handleNumberChange('modelRatio', event.currentTarget.value)}
          />
        </label>
        <label>
          补全倍率
          <input
            value={profile.completionRatio}
            inputMode="decimal"
            onChange={(event) => handleNumberChange('completionRatio', event.currentTarget.value)}
          />
        </label>
        <label>
          分组倍率
          <input
            value={profile.groupRatio}
            inputMode="decimal"
            onChange={(event) => handleNumberChange('groupRatio', event.currentTarget.value)}
          />
        </label>
      </div>
    </section>
  );
}
