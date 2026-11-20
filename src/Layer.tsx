import Parking from './parking-reference';

import React, { useEffect, useId, useRef, useState } from 'react';


const positiveInteger = (raw) => {
  const value = Number(raw);
  return /^\d+$/.test(raw.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null;
};

function Button({children, accent = false, ...props}) {
  return <button type="button" className={'dsa-button' + (accent ? ' accent' : '')} {...props}>{children}</button>;
}

function Feedback({notice, fallback = ''}) {
  return <p role="status" className={'dsa-feedback' + (notice?.error ? ' error' : '')}>{notice?.text || fallback}</p>;
}

function Field({label, value, onChange, placeholder, inputMode, onEnter}) {
  return <label className="dsa-form-row">
    <span className="dsa-label">{label}</span>
    <input className="dsa-input" value={value} placeholder={placeholder} inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onEnter ? (event) => { if (event.key === 'Enter') { event.preventDefault(); onEnter(); } } : undefined} />
  </label>;
}

function BulkField({label, value, onChange, placeholder}) {
  const id = useId();
  return <>
    <label className="dsa-label" htmlFor={id}>{label}</label>
    <textarea id={id} className="dsa-bulk" rows={1} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </>;
}

function parkingExitSteps(cars, target, isStack) {
  const index = cars.indexOf(target);
  const temporarilyOut = isStack ? cars.slice(index + 1).reverse() : cars.slice(0, index);
  let parked = [...cars];
  const steps = [...temporarilyOut, target].map((car) => {
    parked = isStack ? parked.slice(0, -1) : parked.slice(1);
    return {cars:parked, event:'Exit', detail:'Car #' + car + (car === target ? ' left the lot' : ' moved out temporarily')};
  });
  const returning = isStack ? [...temporarilyOut].reverse() : temporarilyOut;
  for (const car of returning) {
    parked = [...parked, car];
    steps.push({cars:parked, event:'Re-enter', detail:'Car #' + car + ' returned'});
  }
  return steps;
}


const styles = "\n@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Serif+Gujarati:wght@500;700&display=swap');\n.dsa { --paper:#f3eee3; --panel:#d9d9d9; --navy:#293152; --accent:#d9541e; --dark:#444; color:#111; width:100%; min-height:100%; font:500 18px/1.4 'Noto Serif Gujarati',Arial,sans-serif; }\n.dsa *, .dsa *::before, .dsa *::after { box-sizing:border-box; }\n.dsa button, .dsa input, .dsa textarea { font:inherit; }\n.dsa h2, .dsa h3, .dsa p { margin:0; }\n.dsa .dsa-label, .dsa .dsa-button, .dsa .dsa-events li strong, .dsa .dsa-peg-label { font:400 24px/1.15 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing:.045em; }\n.dsa .dsa-label { display:block; color:var(--navy); }\n.dsa .dsa-button { min-height:44px; min-width:154px; padding:7px 14px; border:1px solid transparent; border-radius:15px; color:var(--paper); background:var(--navy); cursor:pointer; white-space:nowrap; }\n.dsa .dsa-button.accent { background:var(--accent); color:#111; }\n.dsa .dsa-button:disabled { border-color:var(--dark); background:var(--panel); color:var(--dark); cursor:default; }\n.dsa :is(button,input,textarea):focus-visible { outline:3px solid var(--accent); outline-offset:3px; }\n.dsa .dsa-actions { display:flex; flex-wrap:wrap; gap:14px; align-items:center; }\n.dsa .dsa-input, .dsa .dsa-value, .dsa .dsa-bulk { min-width:0; width:100%; padding:6px 12px; border:1px solid var(--navy); border-radius:10px; background:var(--paper); color:#111; }\n.dsa .dsa-input, .dsa .dsa-value { height:42px; }\n.dsa .dsa-value { display:flex; align-items:center; }\n.dsa .dsa-bulk { resize:vertical; min-height:52px; max-height:144px; border-color:var(--accent); }\n.dsa .dsa-feedback { min-height:30px; overflow-wrap:anywhere; }\n.dsa .dsa-feedback.error { color:#9a2d0c; font-weight:700; }\n.dsa .dsa-monitor { min-width:0; }\n.dsa .dsa-monitor h2, .dsa .dsa-log h2 { font-size:25px; font-weight:700; }\n.dsa .dsa-monitor h2 { margin-bottom:12px; text-align:center; }\n.dsa .dsa-control, .dsa .dsa-log { display:grid; gap:10px; background:var(--dark); color:var(--paper); border-radius:15px; padding:16px; }\n.dsa .dsa-control .dsa-actions { justify-content:center; }\n.dsa .dsa-control .dsa-feedback { font-size:16px; }\n.dsa .dsa-control .dsa-feedback.error { color:#ffd1ba; }\n.dsa .dsa-monitor-row { display:grid; align-items:center; grid-template-columns:minmax(115px,1fr) minmax(100px,210px); gap:12px; font-size:22px; font-weight:700; }\n.dsa .dsa-monitor-row :is(input,output) { font-size:18px; font-weight:500; }\n.dsa .dsa-log { grid-template-rows:36px minmax(0,1fr); min-height:0; }\n.dsa .dsa-log-title { display:flex; justify-content:space-between; align-items:center; }\n.dsa .dsa-log-title .dsa-label { color:var(--paper); }\n.dsa .dsa-events { overflow:auto; margin:0; padding:10px; list-style:none; border-radius:11px; background:var(--panel); color:#111; }\n.dsa .dsa-events li { display:grid; grid-template-columns:88px minmax(0,1fr); align-items:start; padding:3px 0; font-size:17px; }\n.dsa .dsa-events li strong { color:var(--navy); font-size:19px; }\n.dsa .dsa-stack { display:grid; grid-template-columns:minmax(0,571fr) clamp(14px,3.68vw,53px) 2px clamp(16px,6.87vw,99px) minmax(0,496fr); align-items:start; padding:18px 8.89% 0 6.32%; }\n.dsa .dsa-stack .dsa-lane-divider { grid-column:3; align-self:stretch; margin:28px 0 58px; background:var(--accent); }\n.dsa .dsa-stack .dsa-parking-controls { grid-column:5; padding-top:8px; }\n.dsa .dsa-stack .dsa-log { height:330px; margin-top:21px; }\n.dsa .dsa-queue { padding:25px 2.15% 0; }\n.dsa .dsa-queue .dsa-parking-controls { margin:42px 8.7% 0; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:start; gap:clamp(20px,7.56vw,109px); }\n.dsa .dsa-queue .dsa-log { height:340px; }\n.dsa .dsa-workspace { display:grid; align-items:start; }\n.dsa .dsa-tree { padding:51px 4.17% 0 5.35%; grid-template-columns:minmax(0,496fr) minmax(0,781fr); gap:26px; }\n.dsa .dsa-search { margin:25px 4.58% 0 6.53%; padding:35px 44px; grid-template-columns:minmax(0,460fr) minmax(0,671fr); gap:56px; min-height:665px; border-radius:15px; background:var(--panel); }\n.dsa .dsa-hanoi { padding:98px 4.17% 0 5.21%; grid-template-columns:minmax(0,496fr) minmax(0,781fr); gap:28px; }\n.dsa .dsa-panel { background:var(--panel); border-radius:15px; padding:26px; min-width:0; }\n.dsa .dsa-tree .dsa-panel { min-height:641px; }\n.dsa .dsa-form { display:grid; gap:11px; align-content:start; min-width:0; }\n.dsa .dsa-form-row { display:grid; grid-template-columns:minmax(120px,180px) minmax(90px,210px); gap:14px; align-items:center; }\n.dsa .dsa-form-row span { background:var(--navy); color:var(--paper); padding:7px 10px; min-height:42px; display:flex; align-items:center; }\n.dsa .dsa-help { font-size:17px; color:var(--dark); }\n.dsa .dsa-rule { width:100%; height:2px; border:0; margin:0; background:var(--accent); }\n.dsa .dsa-results { display:grid; gap:29px; align-content:start; }\n.dsa .dsa-diagram { position:relative; overflow:auto; display:grid; place-items:center; width:100%; height:480px; border:1px solid var(--navy); }\n.dsa .dsa-graph { position:relative; margin:auto; min-width:100%; min-height:100%; }\n.dsa .dsa-graph svg { position:absolute; inset:0; }\n.dsa .dsa-graph-node { display:flex; justify-content:center; align-items:center; position:absolute; transform:translate(-50%,-50%); width:90px; height:46px; padding:5px; background:var(--navy); border-radius:12px; color:white; text-align:center; overflow:hidden; }\n.dsa .dsa-graph-node span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.dsa .dsa-traversals { display:grid; grid-template-columns:repeat(var(--outputs,1),minmax(0,1fr)); border:1px solid var(--accent); min-height:86px; }\n.dsa .dsa-traversals div { padding:10px 12px; min-width:0; }\n.dsa .dsa-traversals div + div { border-left:1px solid var(--accent); }\n.dsa .dsa-traversals strong { font-size:17px; }\n.dsa .dsa-traversals p { margin-top:3px; overflow-wrap:anywhere; max-height:90px; overflow:auto; }\n.dsa .dsa-hanoi .dsa-form { margin-top:14px; min-height:523px; }\n.dsa .dsa-hanoi .dsa-title-bar { padding:9px; text-align:center; color:var(--paper); background:#000; }\n.dsa .dsa-hanoi .dsa-rule { background:var(--paper); }\n.dsa .dsa-stats { border-radius:15px; background:var(--paper); padding:10px 14px; min-height:102px; }\n.dsa .dsa-hanoi-board { min-height:568px; padding:39px 29px 30px; }\n.dsa .dsa-pegs-wrap { border:1px solid var(--navy); min-height:494px; padding:30px 18px 24px; text-align:center; }\n.dsa .dsa-pegs { display:grid; grid-template-columns:repeat(var(--peg-count),minmax(0,1fr)); align-items:end; gap:12px; height:319px; }\n.dsa .dsa-peg { position:relative; min-height:263px; min-width:0; width:100%; border:2px solid transparent; border-radius:8px; color:var(--navy); padding:0; background:transparent; cursor:pointer; }\n.dsa .dsa-peg:disabled { cursor:default; }\n.dsa .dsa-stem { width:4px; height:205px; position:absolute; bottom:39px; left:50%; transform:translateX(-50%); background:var(--navy); }\n.dsa .dsa-base { position:absolute; width:78%; max-width:164px; bottom:35px; height:4px; left:50%; transform:translateX(-50%); background:var(--navy); }\n.dsa .dsa-disks { position:absolute; bottom:39px; left:4%; width:92%; display:flex; flex-direction:column-reverse; align-items:center; gap:2px; }\n.dsa .dsa-disk { display:grid; place-items:center; max-width:150px; line-height:1; font-size:15px; color:white; background:var(--navy); border-radius:7px; }\n.dsa .dsa-disk.active { background:var(--accent); color:#111; }\n.dsa .dsa-peg-label { position:absolute; bottom:2px; width:100%; left:0; font-size:21px; }\n.dsa .dsa-pegs-wrap .dsa-feedback { margin-top:19px; }\n@media(max-width:900px) {\n  .dsa .dsa-stack,.dsa .dsa-queue .dsa-parking-controls,.dsa .dsa-workspace { display:flex; flex-direction:column; gap:20px; padding-left:16px; padding-right:16px; margin-left:0; margin-right:0; }\n  .dsa .dsa-stack > *,.dsa .dsa-queue .dsa-parking-controls > *,.dsa .dsa-workspace > * { width:100%; }\n  .dsa .dsa-stack .dsa-lane-divider { display:none; }\n}\n";

function walkTree(root, order) {
  const pending = [[root,0,false]];
  const result = [];
  while (pending.length) {
    const [node, depth, emit] = pending.pop();
    if (!node) continue;
    if (emit) { result.push({node,depth}); continue; }
    const left = [node.left,depth + 1,false];
    const right = [node.right,depth + 1,false];
    const self = [node,depth,true];
    if (order === 'pre') pending.push(right,left,self);
    else if (order === 'post') pending.push(self,right,left);
    else pending.push(right,self,left);
  }
  return result;
}

function TreeDiagram({root, generated}) {
  if (!root) return <div className="dsa-diagram"><p className="dsa-help">{generated ? 'The tree is empty.' : 'Your tree will appear here.'}</p></div>;
  const ordered = walkTree(root,'in');
  const width = Math.max(600,ordered.length * 100);
  const depth = ordered.reduce((max,row) => Math.max(max,row.depth),0);
  const height = Math.max(450,110 + depth * 94);
  const positions = new Map(ordered.map(({node,depth}, index) => [node,{x:(index + 0.5) * width / ordered.length,y:58 + depth * 94}]));
  return <div className="dsa-diagram" style={{display:'block'}} tabIndex={0} aria-label="Tree diagram">
    <div className="dsa-graph" style={{width,height,minWidth:0,minHeight:0}}>
      <svg width={width} height={height} aria-hidden="true">
        {ordered.flatMap(({node}, index) => [node.left,node.right].map((child, side) => {
          if (!child) return null;
          const from = positions.get(node), to = positions.get(child);
          return <line key={index + '-' + side} x1={from.x} y1={from.y + 21} x2={to.x} y2={to.y - 21} stroke="#293152" strokeWidth="2" />;
        }))}
      </svg>
      {ordered.map(({node}, index) => {
        const {x,y} = positions.get(node);
        return <div className="dsa-graph-node" key={index} style={{left:x,top:y}} title={String(node.value)}><span>{node.value}</span></div>;
      })}
    </div>
  </div>;
}

function TreeResults({result, search = false}) {
  const outputs = search ? [['Sorted in-order output','in']] : [['In-order','in'],['Pre-order','pre'],['Post-order','post']];
  return <div className={'dsa-results' + (search ? '' : ' dsa-panel')}>
    <TreeDiagram root={result?.root} generated={!!result} />
    <div className="dsa-traversals" style={{'--outputs':outputs.length}} aria-live="polite">
      {outputs.map(([name,order]) => <div key={order}><strong>{name.toUpperCase()}</strong>
        <p>{!result ? 'Awaiting tree' : result.values[order].length ? result.values[order].join(', ') : 'Empty'}</p></div>)}
    </div>
  </div>;
}

function resultFor(root) {
  const values = Object.fromEntries(['in','pre','post'].map((order) => [order,walkTree(root,order).map(({node}) => node.value)]));
  return {root,values};
}

function BinaryTree() {
  const [countText,setCount] = useState('');
  const [positionText,setPosition] = useState('');
  const [value,setValue] = useState('');
  const [bulk,setBulk] = useState('');
  const [slots,setSlots] = useState(() => new Map());
  const [result,setResult] = useState(null);
  const [notice,setNotice] = useState(null);
  const count = positiveInteger(countText);
  const position = positiveInteger(positionText);
  const positionValid = position !== null && count !== null && position <= count;
  const canGenerate = count !== null && slots.size === count;
  const show = (text,error = false) => setNotice({text,error});
  function changeCount(input) {
    if (positiveInteger(input) !== count) { setSlots(new Map()); setResult(null); setPosition(''); }
    setCount(input);
    setNotice(input.trim() && !positiveInteger(input) ? {text:'Enter a positive whole number of positions.',error:true} : null);
  }
  function save(empty) {
    if (!positionValid) return show('Choose a position from 1 to ' + (count || 'the node count') + '.',true);
    if (!empty && !value.trim()) return show('Enter a label or mark this position empty.',true);
    setSlots((old) => new Map(old).set(position,empty ? null : value));
    setResult(null);
    show('Position ' + position + (empty ? ' marked empty.' : ' saved.'));
  }
  function applyList() {
    let values;
    try { values = JSON.parse(bulk); } catch { return show('Enter a JSON array of labels and nulls.',true); }
    if (!Array.isArray(values)) return show('Enter a JSON array of labels and nulls.',true);
    if (values.length !== count) return show('Expected ' + count + ' positions. Received ' + values.length + '.',true);
    if (values.some((entry) => entry !== null && !(typeof entry === 'string' && entry.trim()) && !Number.isFinite(entry))) {
      return show('Use a label or null at each position.',true);
    }
    setSlots(new Map(values.map((entry, index) => [index + 1,entry === null ? null : String(entry)])));
    setResult(null);
    show('Set ' + count + ' positions. Generate the tree to view traversals.');
  }
  function generate() {
    if (!canGenerate) return;
    const nodes = new Map([...slots].filter(([,label]) => label !== null).map(([index,label]) => [index,{value:label,left:null,right:null}]));
    for (const [index,node] of nodes) {
      const parent = Math.floor(index / 2);
      if (index > 1 && !nodes.has(parent)) return show('Position ' + index + ' needs a value in position ' + parent + '.',true);
      node.left = nodes.get(index * 2) || null;
      node.right = nodes.get(index * 2 + 1) || null;
    }
    setResult(resultFor(nodes.get(1) || null));
    show('Tree generated.');
  }
  return <div className="dsa-workspace dsa-tree">
    <div className="dsa-form dsa-panel">
      <Field label="Node count" value={countText} onChange={changeCount} placeholder="e.g. 5" inputMode="numeric" />
      <p className="dsa-help">Count empty positions. Root is position 1.<br />For position n, its children are 2n and 2n + 1.</p>
      <Field label="Position" value={positionText} onChange={(raw) => { setPosition(raw); setValue(slots.get(positiveInteger(raw)) || ''); setNotice(null); }} placeholder="e.g. 1" inputMode="numeric" />
      <Field label="Node label" value={value} onChange={setValue} placeholder="e.g. A + B" onEnter={() => save(false)} />
      <div className="dsa-actions"><Button disabled={!positionValid || !value.trim()} onClick={() => save(false)}>Save node</Button><Button disabled={!positionValid} onClick={() => save(true)}>Mark empty</Button></div>
      <hr className="dsa-rule" />
      <BulkField label="Bulk nodes" value={bulk} onChange={setBulk} placeholder={'["A + B", "7", "C", null, "E"]'} />
      <div className="dsa-actions"><Button disabled={!count || !bulk.trim()} onClick={applyList}>Apply list</Button></div>
      <p className="dsa-help">{count ? slots.size + ' of ' + count + ' positions configured' : 'Set the node count to start.'}</p>
      <div className="dsa-actions"><Button disabled={!canGenerate} onClick={generate}>Generate</Button></div>
      {notice && <Feedback notice={notice} />}
    </div>
    <TreeResults result={result} />
  </div>;
}

function numericValue(raw) {
  const value = Number(raw);
  const valid = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim());
  return valid && Number.isFinite(value) ? value : null;
}

function SearchTree() {
  const [countText,setCount] = useState('');
  const [number,setNumber] = useState('');
  const [bulk,setBulk] = useState('');
  const [numbers,setNumbers] = useState([]);
  const [result,setResult] = useState(null);
  const [notice,setNotice] = useState(null);
  const count = positiveInteger(countText);
  const show = (text,error = false) => setNotice({text,error});
  const canGenerate = count !== null && numbers.length === count;
  function updateCount(input) {
    if (positiveInteger(input) !== count) { setNumbers([]); setResult(null); }
    setCount(input);
    setNotice(input.trim() && !positiveInteger(input) ? {text:'Enter a positive whole node count.',error:true} : null);
  }
  function insert() {
    if (!count || numbers.length >= count) return;
    const value = numericValue(number);
    if (value === null) return show('Enter a finite whole number or decimal.',true);
    setNumbers([...numbers,value]);
    setResult(null);
    setNumber('');
    show('Added ' + value + '.');
  }
  function applyList() {
    if (!count) return;
    const parts = bulk.split(',');
    if (parts.some((part) => !part.trim())) return show('Enter a number between commas.',true);
    const next = parts.flatMap((part) => part.trim().split(/\s+/)).map(numericValue);
    if (next.includes(null)) return show('Enter finite numbers only.',true);
    if (next.length !== count) return show('Expected ' + count + ' values. Received ' + next.length + '.',true);
    setNumbers(next);
    setResult(null);
    show('Loaded ' + count + ' values.');
  }
  function generate() {
    if (!canGenerate) return;
    const root = {value:numbers[0],left:null,right:null};
    for (const value of numbers.slice(1)) {
      let node = root;
      for (;;) {
        const side = value < node.value ? 'left' : 'right';
        if (!node[side]) { node[side] = {value,left:null,right:null}; break; }
        node = node[side];
      }
    }
    setResult(resultFor(root));
    show('Search tree generated.');
  }
  return <div className="dsa-workspace dsa-search">
    <div className="dsa-form">
      <Field label="Node count" value={countText} onChange={updateCount} placeholder="e.g. 5" inputMode="numeric" />
      <p className="dsa-help">Enter exactly that many numbers.</p>
      <Field label="Input value" value={number} onChange={setNumber} placeholder="e.g. 8" inputMode="decimal" onEnter={insert} />
      <div className="dsa-actions"><Button disabled={!count || !number.trim() || numbers.length >= count} onClick={insert}>Insert</Button></div>
      <hr className="dsa-rule" />
      <BulkField label="Input bulk values" value={bulk} onChange={setBulk} placeholder="e.g. 8, 3, 10, 1, 6" />
      <div className="dsa-actions"><Button disabled={!count || !bulk.trim()} onClick={applyList}>Apply list</Button></div>
      <p className="dsa-help">{count ? numbers.length + ' of ' + count + ' values entered' : 'Set the node count to start.'}</p>
      {numbers.length > 0 && <p className="dsa-help" style={{maxHeight:80,overflow:'auto',overflowWrap:'anywhere'}}>{numbers.join(', ')}</p>}
      <div className="dsa-actions"><Button disabled={!canGenerate} onClick={generate}>Generate</Button></div>
      {notice && <Feedback notice={notice} />}
    </div>
    <TreeResults result={result} search />
  </div>;
}

function startingPegs(disks, pegs) {
  return Array.from({length:pegs}, (_,index) => index > 0 ? [] : Array.from({length:disks}, (_,i) => disks - i));
}

function* hanoiMoves(piles, disk, target) {
  if (disk === 0) return;
  const source = piles.findIndex((stack) => stack.includes(disk));
  if (source !== target) {
    const spare = piles.findIndex((_, index) => index !== source && index !== target);
    yield* hanoiMoves(piles,disk - 1,spare);
    piles[target].push(piles[source].pop());
    yield {disk,from:source,to:target,board:piles.map((stack) => [...stack])};
  }
  yield* hanoiMoves(piles,disk - 1,target);
}

const pegLabel = (index) => String.fromCharCode(65 + index);

function Hanoi() {
  const [diskText,setDiskText] = useState('3');
  const [pegText,setPegText] = useState('3');
  const [diskCount,setDiskCount] = useState(3);
  const [board,setBoard] = useState(() => startingPegs(3,3));
  const [source,setSource] = useState(null);
  const [moves,setMoves] = useState(0);
  const [solving,setSolving] = useState(false);
  const [notice,setNotice] = useState(null);
  const timer = useRef(null);
  const solverActive = useRef(false);
  const goal = board.length - 1;
  const won = board[goal].length === diskCount;
  const show = (text,error = false) => setNotice({text,error});
  useEffect(() => () => { clearTimeout(timer.current); solverActive.current = false; }, []);
  function reset() {
    const disks = positiveInteger(diskText), pegs = positiveInteger(pegText);
    if (disks === null || disks > 12 || pegs === null || pegs < 3 || pegs > 5) return show('Choose 1–12 disks and 3–5 pegs.',true);
    clearTimeout(timer.current);
    solverActive.current = false;
    setSolving(false);
    setDiskCount(disks);
    setBoard(startingPegs(disks,pegs));
    setSource(null);
    setMoves(0);
    setNotice(null);
  }
  function pick(peg) {
    if (solverActive.current || won) return;
    if (source === null) {
      if (!board[peg].length) return show('That peg has no disk to move.',true);
      setSource(peg);
      return show('Peg ' + pegLabel(peg) + ' selected. Choose a destination.');
    }
    if (source === peg) { setSource(null); setNotice(null); return; }
    const disk = board[source].at(-1), top = board[peg].at(-1);
    if (top !== undefined && top < disk) return show('A larger disk cannot go on a smaller one.',true);
    const next = board.map((stack) => [...stack]);
    next[peg].push(next[source].pop());
    setBoard(next);
    setMoves((count) => count + 1);
    setSource(null);
    show(next[goal].length === diskCount ? 'Puzzle solved. All disks reached the goal.' : 'Disk ' + disk + ' moved to Peg ' + pegLabel(peg) + '.');
  }
  function solve() {
    if (solverActive.current || won) return;
    clearTimeout(timer.current);
    solverActive.current = true;
    setSolving(true);
    setSource(null);
    const sequence = hanoiMoves(board.map((stack) => [...stack]),diskCount,goal);
    function play() {
      if (!solverActive.current) return;
      const next = sequence.next();
      if (next.done) {
        solverActive.current = false;
        setSolving(false);
        return show('Puzzle solved. All disks reached the goal.');
      }
      const {disk,to,board:updated} = next.value;
      setBoard(updated);
      setMoves((count) => count + 1);
      show('Auto-solve moved disk ' + disk + ' to Peg ' + pegLabel(to) + '.');
      timer.current = setTimeout(play,diskCount > 7 ? 100 : 270);
    }
    play();
  }
  const diskHeight = Math.min(24,Math.floor(194 / diskCount) - 2);
  const phase = won ? 'Solved' : solving ? 'Auto-solve in progress' : 'Ready to play';
  return <div className="dsa-workspace dsa-hanoi">
    <div className="dsa-panel dsa-form">
      <h2 className="dsa-label dsa-title-bar">GAME SETTING</h2>
      <Field label="Disk count" value={diskText} onChange={setDiskText} inputMode="numeric" onEnter={reset} />
      <Field label="Peg count" value={pegText} onChange={setPegText} inputMode="numeric" onEnter={reset} />
      <p className="dsa-help">Use 1–12 disks and 3–5 pegs. Reset to apply settings.</p>
      <hr className="dsa-rule" />
      <div className="dsa-actions"><Button disabled={solving || won} onClick={solve}>Auto solve</Button><Button accent onClick={reset}>Reset game</Button></div>
      <hr className="dsa-rule" />
      <div className="dsa-stats" aria-live="polite"><span className="dsa-label">STATS</span><strong>{moves} {moves === 1 ? 'move' : 'moves'}</strong><p>{phase}</p></div>
    </div>
    <div className="dsa-panel dsa-hanoi-board">
      <div className="dsa-pegs-wrap">
        <span className="dsa-label">MOVE ALL DISKS TO PEG {pegLabel(goal)}</span>
        <div className="dsa-pegs" style={{'--peg-count':board.length}}>
          {board.map((stack,peg) => <button type="button" key={peg} className="dsa-peg" aria-label={'Peg ' + pegLabel(peg) + (peg === goal ? ', goal' : '')} aria-pressed={source === peg} disabled={solving || won} onClick={() => pick(peg)}>
            <span aria-hidden="true" className="dsa-stem" /><span aria-hidden="true" className="dsa-base" />
            <span className="dsa-disks" aria-hidden="true">
              {stack.map((disk,index) => <span key={disk} className={'dsa-disk' + (source === peg && index === stack.length - 1 ? ' active' : '')} style={{height:diskHeight,width:(35 + 52 * disk / diskCount) + '%'}}>{disk}</span>)}
            </span>
            <span className="dsa-peg-label">PEG {pegLabel(peg)}{peg === goal ? ' (GOAL)' : ''}</span>
          </button>)}
        </div>
        <Feedback notice={notice} fallback="Select a source peg, then a destination." />
      </div>
    </div>
  </div>;
}

export default function Layer({simulation = 'stack'}) {
  const mode = String(simulation).trim().toLowerCase();
  let view;
  if (mode === 'tree') view = <BinaryTree />;
  else if (mode === 'search') view = <SearchTree />;
  else if (mode === 'hanoi') view = <Hanoi />;
  else view = <Parking key={mode} isStack={mode !== 'queue'} Button={Button} Feedback={Feedback} positiveInteger={positiveInteger} parkingExitSteps={parkingExitSteps} />;
  return <div className="dsa"><style>{styles}</style>{view}</div>;
}