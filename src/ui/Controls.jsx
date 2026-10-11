import { getSuggestions } from '../game/simulation.js';

export default function Controls({ level, config, disabled, onChange }) {
  const suggestions = level.id === 13 ? getSuggestions(config.prefix || '', { refresh: config.refresh }) : [];
  return <div className="controls">
    {level.controls.map(control => {
      const id = `control-${level.id}-${control.key}`;
      const value = config[control.key];
      const label = `${control.label}${control.unit ? ` (${control.unit})` : ''}`;
      return <div className={`control control-${control.type}`} key={control.key}>
        <div className="control-heading"><label htmlFor={id}>{label}</label>{control.type === 'toggle' && <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(control.key, e.target.checked)}/>}</div>
        {control.type === 'range' && <div className="range-row"><input id={id} type="range" min={control.min} max={control.max} step={control.step ?? 1} value={value} disabled={disabled} onChange={e => onChange(control.key, Number(e.target.value))}/><input className="number-input" aria-label={`${label}, exact value`} type="number" min={control.min} max={control.max} step={control.step ?? 1} value={value} disabled={disabled} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(control.key, Math.max(control.min ?? -Infinity, Math.min(control.max ?? Infinity, e.target.valueAsNumber))); }}/></div>}
        {control.type === 'select' && <select id={id} value={value} disabled={disabled} onChange={e => { const option = control.options.find(item => String(item.value) === e.target.value); onChange(control.key, option?.value ?? e.target.value); }}>{control.options.map(option => <option key={String(option.value)} value={option.value}>{option.label}</option>)}</select>}
        {control.type === 'text' && <input id={id} type="text" value={value ?? ''} disabled={disabled} autoComplete="off" spellCheck="false" maxLength={80} onChange={e => onChange(control.key, e.target.value)}/>}
      </div>;
    })}
    {level.id === 13 && <div className="suggestions" aria-live="polite"><ul aria-label="Live prefix matches">{suggestions.map(item => <li key={item.text}><span>{item.text}</span><span className="mono">{item.frequency} searches</span></li>)}</ul>{suggestions.length === 0 && <p>No matching queries.</p>}</div>}
  </div>;
}
