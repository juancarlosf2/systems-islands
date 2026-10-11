import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Compass, Flag, Play, RotateCcw, Settings, Star, Volume2, VolumeX, X } from 'lucide-react';
import World from './World.jsx';
import { levels, getLevel } from './game/levels.js';
import { evaluateLevel, getDefaultConfig } from './game/simulation.js';
import Controls from './ui/Controls.jsx';
import Modal from './ui/Modal.jsx';
import ActionButton from './ui/ActionButton.jsx';
import { loadProgress, saveProgress } from './ui/progress.js';

const pad = value => String(value).padStart(2, '0');
function Stars({ count = 0, small = false }) {
  return <span className={`stars ${small ? 'stars-small' : ''}`} aria-label={`${count} of 3 beacon stars`}>{[1, 2, 3].map(number => <Star key={number} size={small ? 11 : 23} fill={number <= count ? 'currentColor' : 'none'} className={number <= count ? 'earned' : ''} aria-hidden="true"/>)}</span>;
}
function readable(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(readable).join(' · ');
  return Object.entries(value).map(([key, item]) => `${key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}: ${readable(item)}`).join(' · ');
}
function scenarioRows(scenario) {
  if (!scenario) return null;
  if (typeof scenario !== 'object' || Array.isArray(scenario)) return <p>{readable(scenario)}</p>;
  return <dl className="scenario-list">{Object.entries(scenario).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt><dd>{readable(value)}</dd></div>)}</dl>;
}

export default function App() {
  const [mode, setMode] = useState('chart');
  const [selected, setSelected] = useState(1);
  const [config, setConfig] = useState(() => getDefaultConfig(1));
  const [progress, setProgress] = useState(loadProgress);
  const initialReducedMotion = useReducedMotion();
  const [systemReducedMotion, setSystemReducedMotion] = useState(Boolean(initialReducedMotion));
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const reduceMotion = Boolean(systemReducedMotion || progress.settings.reducedMotion);
  const entry = { initial: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }, animate: { opacity: 1, y: 0 } };
  const [result, setResult] = useState(null);
  const [trialResult, setTrialResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [notice, setNotice] = useState('Choose an island to begin your expedition.');
  const [saveAvailable, setSaveAvailable] = useState(true);
  const timers = useRef([]);
  const audioContext = useRef(null);
  const heading = useRef(null);
  const resultHeading = useRef(null);
  const firstRender = useRef(true);
  const level = getLevel(selected);
  const completed = levels.filter(item => progress.stars[item.id] > 0).length;
  const allComplete = completed === levels.length;
  const totalStars = Object.values(progress.stars).reduce((sum, count) => sum + count, 0);
  const worldConfig = useMemo(() => ({ ...config, reducedMotion: progress.settings.reducedMotion }), [config, progress.settings.reducedMotion]);

  const stopTrial = useCallback(() => {
    timers.current.forEach(id => { clearTimeout(id); clearInterval(id); });
    timers.current = [];
    setRunning(false);
    setElapsed(0);
    setTrialResult(null);
  }, []);
  useEffect(() => () => {
    timers.current.forEach(id => { clearTimeout(id); clearInterval(id); });
    audioContext.current?.close();
  }, []);
  useEffect(() => { setSaveAvailable(saveProgress(progress)); }, [progress]);
  useEffect(() => {
    if (!firstRender.current) heading.current?.focus({ preventScroll: true });
    firstRender.current = false;
  }, [mode, selected]);
  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  const tone = useCallback((finish = false) => {
    if (!progress.settings.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      const context = audioContext.current || new Audio();
      audioContext.current = context;
      context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(finish ? 660 : 330, context.currentTime);
      gain.gain.setValueAtTime(0.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.22);
    } catch { /* Audio is optional; gameplay remains available. */ }
  }, [progress.settings.sound]);

  const selectChapter = useCallback(id => {
    const chapter = levels.find(item => item.id === Number(id));
    if (!chapter) return;
    stopTrial(); setSelected(chapter.id); setConfig(getDefaultConfig(chapter.id)); setResult(null); setDialog(null);
    setNotice(`Chapter ${pad(chapter.id)} selected. ${chapter.title}.`);
  }, [stopTrial]);
  const enterIsland = useCallback(() => { setMode('level'); setNotice(`Entered ${level.title}. Adjust your architecture, then run a traffic trial.`); tone(); }, [level.title, tone]);
  const returnToChart = useCallback(() => { stopTrial(); setMode('chart'); setDialog(null); setNotice('Expedition chart. Choose any chapter.'); }, [stopTrial]);
  const nextIsland = () => {
    if (selected === levels.length) { returnToChart(); return; }
    selectChapter(selected + 1); setMode('level');
  };
  const runTrial = useCallback(() => {
    if (running || mode !== 'level') return;
    const snapshot = { ...config };
    const id = selected;
    let evaluation;
    try { evaluation = evaluateLevel(id, snapshot); }
    catch { setNotice('The trial could not start. Your progress is safe. Change your setup or try again.'); return; }
    setTrialResult(evaluation);
    setResult(null); setRunning(true); setElapsed(0); tone();
    setNotice('Traffic trial running. Follow the orange couriers through your architecture.');
    const start = Date.now();
    timers.current.push(setInterval(() => setElapsed(Math.min(100, (Date.now() - start) / 60)), 100));
    timers.current.push(setTimeout(() => {
      stopTrial();
      setResult(evaluation);
      if (evaluation.passed && evaluation.stars >= 1) setProgress(previous => ({ ...previous, stars: { ...previous.stars, [id]: Math.max(previous.stars[id] || 0, Math.min(3, evaluation.stars)) } }));
      setNotice(evaluation.passed ? `Beacon restored. ${evaluation.stars} stars earned. Trial debrief ready.` : 'Trial complete. Review the objectives and try another configuration.');
      tone(true);
    }, 6000));
  }, [config, mode, running, selected, stopTrial, tone]);

  useEffect(() => {
    const onKey = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable || dialog) return;
      if (event.key.toLowerCase() === 'g') { event.preventDefault(); setDialog('guide'); }
      if (event.key.toLowerCase() === 'c' && mode === 'level') { event.preventDefault(); returnToChart(); }
      if (event.key.toLowerCase() === 'r' && mode === 'level' && !running) { event.preventDefault(); runTrial(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, mode, running, returnToChart, runTrial]);
  const inspect = useCallback(key => { setInspection(key); setDialog('inspect'); }, []);
  const onReady = useCallback(value => setRenderer(value), []);
  const landmarks = Array.isArray(level.landmarks) ? level.landmarks : Object.entries(level.landmarks || {}).map(([key, value]) => ({ key, ...(typeof value === 'object' ? value : { name: key, explanation: value }) }));
  const landmark = landmarks.find(item => item.key === inspection);
  const updateControl = (key, value) => { setConfig(previous => ({ ...previous, [key]: value })); setResult(null); setNotice('Architecture updated. Run a new trial to test this configuration.'); };

  return <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'} transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}><div className={`app ${mode === 'level' ? 'island-mode' : 'chart-mode'} ${reduceMotion ? 'reduced-motion' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to expedition</a>
    <aside className="expedition-rail" aria-label="Expedition chapters">
      <ActionButton className="wordmark" onClick={returnToChart} aria-label="Systems / Islands — expedition chart">SYSTEMS <span>/</span> ISLANDS<Compass size={23} strokeWidth={1.5}/></ActionButton>
      {mode === 'chart' ? <motion.div {...entry} key={`chart-${selected}`} className="chart-intro">
        <h1 ref={heading} tabIndex={-1}>{level.title}</h1>
        {allComplete && <p className="chart-completion"><Check size={14}/> All sixteen beacons restored.</p>}
        <ActionButton className="primary enter-button" onClick={enterIsland}>Enter island <ArrowRight size={19}/></ActionButton>
      </motion.div> : <motion.div {...entry} key={`island-${selected}`} className="rail-island-heading"><ActionButton className="text-button" onClick={returnToChart}><ArrowLeft size={15}/> Expedition chart</ActionButton><h1 ref={heading} tabIndex={-1}>{level.title}</h1><Stars count={progress.stars[selected] || 0}/></motion.div>}
      <div className="chapter-route-label"><span className="mono">{completed}/16 restored</span></div>
      <nav className="chapter-list" aria-label="Choose a chapter">{levels.map(item => <ActionButton key={item.id} aria-current={selected === item.id ? 'step' : undefined} className={`chapter-item ${selected === item.id ? 'active' : ''}`} onClick={() => selectChapter(item.id)}><span className="chapter-number">{pad(item.id)}</span><span className={`chapter-beacon ${progress.stars[item.id] ? 'lit' : ''}`} aria-label={progress.stars[item.id] ? 'Completed' : 'Not completed'}/><span className="chapter-name">{item.title}</span>{progress.stars[item.id] ? <Stars small count={progress.stars[item.id]}/> : <ChevronRight className="chapter-chevron" size={13}/>}</ActionButton>)}</nav>
      <footer className="rail-footer"><div><Flag size={14}/><span>{totalStars} / 48 beacon stars</span></div>{!saveAvailable && <span role="status">Saving unavailable</span>}</footer>
    </aside>

    <main id="main-content" className="main-content" tabIndex={-1}>
      <div className="world-stage" aria-label={mode === 'chart' ? 'Interactive archipelago chart' : `${level.title} miniature environment`}>
        <World mode={mode} level={level} config={worldConfig} running={running} result={running ? trialResult : result} onSelectLevel={selectChapter} onInspect={inspect} onReady={onReady}/>
      </div>
      <header className="world-toolbar"><div className="toolbar-actions"><ActionButton className="surface-button" onClick={() => setDialog('guide')}><BookOpen size={17}/><span>Field guide</span></ActionButton><ActionButton className="surface-button icon-button" onClick={() => setDialog('settings')} aria-label="Expedition settings"><Settings size={17}/></ActionButton><ActionButton className="surface-button icon-button" aria-label={`Sound ${progress.settings.sound ? 'on' : 'off'}. Toggle sound`} aria-pressed={progress.settings.sound} onClick={() => setProgress(previous => ({ ...previous, settings: { ...previous.settings, sound: !previous.settings.sound } }))}>{progress.settings.sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</ActionButton></div></header>
      {renderer?.ok === false && <div className="renderer-notice" role="status">{renderer.message || '3D view unavailable. All chapters and controls remain playable below.'}</div>}
      {mode === 'level' && <>
        <AnimatePresence>{running && <motion.div key="trial" initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduceMotion ? 1 : 0 }} className="trial-status visible"><strong>{elapsed < 33 ? 'Dispatching requests…' : elapsed < 66 ? 'Testing the bottlenecks…' : 'Reading the instruments…'}</strong><progress value={elapsed} max={100} aria-label="Traffic trial progress"/></motion.div>}</AnimatePresence>
        <motion.section {...entry} key={selected} className="mission-panel" aria-label="Island mission and architecture controls">
          <div className="mission-main"><p className="brief">{level.brief.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] || level.brief}</p>
            <ul className="objective-list" aria-label="Mission objectives">{level.objectives.map((objective, index) => <li key={index}><span className={`objective-check ${result?.objectives[index]?.met ? 'met' : ''}`}>{result?.objectives[index]?.met ? <Check size={13}/> : <span>{index + 1}</span>}</span><span>{objective}</span></li>)}</ul>
            {level.scenario && <details className="scenario"><summary>Workload & assumptions</summary>{scenarioRows(level.scenario)}</details>}
            <details className="landmark-actions"><summary>Inspect landmarks</summary><div>{landmarks.map(item => <ActionButton key={item.key} className="landmark-chip" onClick={() => inspect(item.key)}>{item.name || item.key}<ArrowRight size={11}/></ActionButton>)}</div></details>
          </div>
          <div className="architecture-panel"><Controls level={level} config={config} disabled={running} onChange={updateControl}/><div className="trial-actions"><ActionButton className="primary" disabled={running} onClick={runTrial}>{running ? 'Traffic trial running…' : result ? 'Run another trial' : 'Run traffic trial'}<Play size={16} fill="currentColor"/></ActionButton><ActionButton className="text-button reset-config" disabled={running} onClick={() => { setConfig(getDefaultConfig(selected)); setResult(null); setNotice('Architecture reset to its starting configuration.'); }}><RotateCcw size={13}/> Reset architecture</ActionButton></div></div>
        </motion.section>
        {result && <motion.section {...entry} className={`debrief ${result.passed ? 'passed' : 'needs-work'}`} aria-label="Trial debrief"><div className="debrief-heading"><div><h2 tabIndex={-1} ref={resultHeading}>{result.passed ? 'Beacon restored' : 'Try another design'}</h2></div><div className="score"><Stars count={result.stars}/><span className="mono">{Math.round(result.score)} / 100</span></div></div>
          <p className="debrief-summary">{readable(result.debrief)}</p><div className="metric-grid">{result.metrics.map((metric, index) => <motion.div {...entry} transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : Math.min(index, 3) * 0.035 }} key={index} className={`metric metric-${metric.status || 'neutral'}`}><span>{metric.label}</span><strong>{readable(metric.value)}<small>{metric.unit ? ` ${metric.unit}` : ''}</small></strong></motion.div>)}</div>
          <ul className="result-objectives">{result.objectives.map((objective, index) => <li key={index} className={objective.met ? 'met' : 'unmet'}>{objective.met ? <Check size={15}/> : <X size={15}/>}<span>{objective.label}</span><b>{objective.met ? 'Met' : 'Try again'}</b></li>)}</ul>
          {Array.isArray(result.suggestions) && <div className="suggestions debrief-suggestions"><span className="eyebrow">Trial suggestions</span><ul aria-label="Trial suggestions">{result.suggestions.map(item => <li key={item.text}><span>{item.text}</span><span className="mono">{item.frequency} searches</span></li>)}</ul>{result.suggestions.length === 0 && <p>No matching queries in this trial.</p>}</div>}
          {!readable(result.debrief).includes(readable(result.explanation)) && <div className="explanation"><p>{readable(result.explanation)}</p></div>}
          {result.events?.length > 0 && <details className="trial-log"><summary>Request log · {result.events.length} events</summary><ol>{result.events.map((event, index) => <li key={index}><span className="mono">{event.type}</span>{event.message}</li>)}</ol></details>}
          {allComplete && <div className="completion-card"><Flag size={25}/><div><h3>Expedition complete</h3><p>All sixteen islands have earned a beacon. Your architecture journey continues.</p></div></div>}
          <div className="debrief-actions"><ActionButton className="surface-button" onClick={() => { setResult(null); setNotice('Ready for your next experiment. Adjust the architecture above.'); document.querySelector('.architecture-panel')?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center' }); document.querySelector('.architecture-panel input, .architecture-panel select')?.focus({ preventScroll: true }); }}><RotateCcw size={15}/> Refine this design</ActionButton><ActionButton className="primary" onClick={nextIsland}>{selected === 16 ? 'Return to chart' : 'Next island'}<ArrowRight size={17}/></ActionButton></div>
        </motion.section>}
        <footer className="level-footer"><ActionButton className="text-button" onClick={returnToChart}><ArrowLeft size={14}/> Chart</ActionButton><span className="mono">{pad(selected)} / 16</span><ActionButton className="text-button" onClick={nextIsland}>{selected === 16 ? 'Chart' : 'Next island'}<ArrowRight size={14}/></ActionButton></footer>
      </>}
    </main>
    <div className="sr-only" role="status" aria-live="polite">{notice}</div>
    {dialog && <Modal title={dialog === 'guide' ? 'The field guide' : dialog === 'settings' ? 'Expedition settings' : dialog === 'restart' ? 'Begin a new expedition?' : landmark?.name || 'Island landmark'} wide={dialog === 'guide'} reduceMotion={reduceMotion} onClose={() => setDialog(null)}>{close => <>
      {dialog === 'guide' && <><h3>{level.subtitle}</h3><p>{level.brief}</p>{(Array.isArray(level.guide) ? level.guide : [level.guide]).map((paragraph, index) => <p className="guide-copy" key={index}>{readable(paragraph)}</p>)}<dl className="guide-controls">{level.controls.map(control => <div key={control.key}><dt>{control.label}{control.unit ? ` (${control.unit})` : ''}</dt><dd>{control.help}</dd></div>)}</dl><div className="concept-tags">{level.concepts?.map(concept => <span key={concept}>{concept}</span>)}</div><hr/><p>Choose any island. Drag to orbit and scroll to zoom. Inspect its landmarks, adjust the architecture, and run a six-second traffic trial. Restore the beacon by meeting all three objectives. Meet all three objectives to restore the beacon and earn up to three stars.</p><p>Your best stars are saved on this device. Every island stays open for exploration.</p><div className="keyboard-guide"><span><kbd>G</kbd> Field guide</span><span><kbd>C</kbd> Chart</span><span><kbd>R</kbd> Run trial</span><span><kbd>Esc</kbd> Close dialog</span></div><p className="simulation-note">All traffic and metrics are invented teaching simulations. Controls are keyboard accessible. Shortcuts pause while you type or open a dialog. These original missions explore chapter concepts from System Design Interview: An Insider’s Guide, by Alex Xu.</p></>}
      {dialog === 'inspect' && <><p className="guide-copy">{landmark?.explanation || landmark?.description || 'This landmark is part of the island’s service architecture. Follow the couriers during a traffic trial to see its role.'}</p><ActionButton className="primary" onClick={close}>Back to the island<ArrowRight size={15}/></ActionButton></>}
      {dialog === 'settings' && <><label className="setting-row"><strong>Sound</strong><input type="checkbox" checked={progress.settings.sound} onChange={e => setProgress(previous => ({ ...previous, settings: { ...previous.settings, sound: e.target.checked } }))}/></label><label className="setting-row"><strong>Reduce motion</strong><input type="checkbox" checked={progress.settings.reducedMotion} onChange={e => setProgress(previous => ({ ...previous, settings: { ...previous.settings, reducedMotion: e.target.checked } }))}/></label><p>{completed} of 16 islands restored · {totalStars} beacon stars</p>{!saveAvailable && <p className="simulation-note">Local storage is unavailable. This session’s progress cannot be saved.</p>}<ActionButton className="surface-button" onClick={() => setDialog('restart')}><RotateCcw size={15}/> Restart expedition</ActionButton></>}
      {dialog === 'restart' && <><p>This clears all earned beacon stars on this device. Sound and motion settings are preserved.</p><div className="debrief-actions"><ActionButton className="surface-button" onClick={() => setDialog('settings')}>Keep my progress</ActionButton><ActionButton className="primary" onClick={() => close(() => { setProgress(previous => ({ ...previous, stars: {} })); returnToChart(); selectChapter(1); setNotice('A new expedition begins. Your beacon stars have been cleared.'); })}>Restart expedition<RotateCcw size={15}/></ActionButton></div></>}
    </>}</Modal>}
  </div></MotionConfig>;
}
