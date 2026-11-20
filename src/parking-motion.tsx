import React, { useEffect, useRef, useState } from 'react';

type Point = [number, number];
type Rect = [number, number, number, number];
type Waypoint = [x: number, y: number, angle: number];
type Pose = { x: number; y: number; angle: number };
type Scene = Map<number, Pose>;
type EventRow = { event: string; detail: string };
type ExitStep = EventRow & { cars: number[] };
type Notice = { text: string; error: boolean };

const CAPACITY = 10;
const BAY_NUMBERS = Array.from({ length: CAPACITY }, (_, index) => index);
const PAINTS = ['#4d9a91', '#789cce', '#e2aa60'];
const STACK_LANE_X = 157;
const HOLDING_LANE_X = 413;
const STACK = {
  size: [560, 625] as Point,
  bays: BAY_NUMBERS.map((index): Rect => [32, 80 + 51.4 * (9 - index), 200, 51.4]),
  holding: [279, 80, 250, 514] as Rect,
  outside: [STACK_LANE_X, -56] as Point,
};
const QUEUE = {
  size: [1350, 220] as Point,
  bays: BAY_NUMBERS.map((index): Rect => [135 + 242 * (index % 5), index < 5 ? 10 : 134, 231, 76]),
  aisle: [132, 89, 1218, 42] as Rect,
  apron: [0, 0, 132, 220] as Rect,
  marks: [[130, 79, 4, 12], [130, 129, 4, 12]] as Rect[],
  dashes: Array.from({ length: 16 }, (_, index): Rect => [168 + 72.1875 * index, 109, 23, 2]),
  outside: [-57, 110] as Point,
};

function percent(value: number, total: number) {
  return `${100 * value / total}%`;
}

function bounds([x, y, width, height]: Rect, [boardWidth, boardHeight]: Point): React.CSSProperties {
  return { left: percent(x, boardWidth), top: percent(y, boardHeight), width: percent(width, boardWidth), height: percent(height, boardHeight) };
}

function bayPose(isStack: boolean, index: number): Pose {
  const [x, y, width, height] = (isStack ? STACK : QUEUE).bays[index];
  return { x: isStack ? STACK_LANE_X : x + width / 2, y: y + height / 2, angle: isStack ? -90 : 180 };
}

function arrival(isStack: boolean, index: number): Waypoint[] {
  const { x, y, angle } = bayPose(isStack, index);
  if (isStack) return [[x, 60, -90], [x, y, angle]];
  const side = index < 5 ? -1 : 1;
  return [[132, 110, 0], [x + 58, 110, 0], [x + 67, y - 31 * side, 90 * side], [x + 36, y - 6 * side, 155 * side], [x, y, angle]];
}

function departure(isStack: boolean, index: number): Waypoint[] {
  const { x, y } = bayPose(isStack, index);
  if (isStack) return [[x, 60, -90], [...STACK.outside, -90]];
  return [[x - 39, (y + 110) / 2, index < 5 ? 145 : 215], [x - 74, 110, 180], [132, 110, 180], [...QUEUE.outside, 180]];
}

function holdingRoute(position: number): Waypoint[] {
  return [[STACK_LANE_X, 62, -90], [STACK_LANE_X + 27, 47, -25], [HOLDING_LANE_X - 25, 47, 0], [HOLDING_LANE_X, 72, -90], [HOLDING_LANE_X, 568 - 49 * position, -90]];
}

function holdingReturn(slot: number): Waypoint[] {
  return [[HOLDING_LANE_X, 72, -90], [HOLDING_LANE_X - 25, 47, -155], [STACK_LANE_X + 25, 47, 180], [STACK_LANE_X, 62, -90], ...arrival(true, slot).slice(1)];
}

function paintFrame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { cancelAnimationFrame(frame); reject(signal.reason); };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    });
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function animatePath(node: HTMLSpanElement, start: Pose, path: Waypoint[], size: Point, signal: AbortSignal, fixedDuration?: number) {
  const pickup = [{ ...start, elapsed: 0 }];
  for (const [x, y, heading] of path) {
    const previous = pickup[pickup.length - 1];
    const turn = ((heading - previous.angle + 540) % 360) - 180;
    const duration = fixedDuration ?? Math.min(600, Math.round(94 + .49 * Math.hypot(x - previous.x, y - previous.y) + .52 * Math.abs(turn)));
    pickup.push({ x, y, angle: previous.angle + turn, elapsed: previous.elapsed + duration });
  }
  const end = pickup[pickup.length - 1];
  const art = node.firstElementChild as HTMLElement;
  const location = (pose: Pose) => ({ left: percent(pose.x, size[0]), top: percent(pose.y, size[1]) });
  const rotation = (pose: Pose) => ({ transform: `rotate(${pose.angle}deg)` });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    const timing: KeyframeAnimationOptions = { duration: end.elapsed, fill: 'forwards', easing: 'ease-in-out' };
    const movement = node.animate(pickup.map(pose => ({ ...location(pose), offset: pose.elapsed / end.elapsed })), timing);
    const turn = art.animate(pickup.map(pose => ({ ...rotation(pose), offset: pose.elapsed / end.elapsed })), timing);
    const stop = () => { movement.cancel(); turn.cancel(); };
    signal.addEventListener('abort', stop, { once: true });
    try {
      await Promise.all([movement.finished, turn.finished]);
      Object.assign(node.style, location(end));
      Object.assign(art.style, rotation(end));
    } finally {
      signal.removeEventListener('abort', stop);
      stop();
    }
  }
  return { x: end.x, y: end.y, angle: end.angle };
}

// Dimensions from the ParkingCar component, in the coordinates of its silhouette.
const CAR_SIZE: Point = [97.28, 46.08];
const CAR_PARTS: Array<[color: string, x: number, y: number, width: number, height: number, radius: number, opacity?: number]> = [
  ['#141a24', 2.56, 3.84, 92.16, 42.24, 16.64, .5],
  ['#141a24', 16.64, 0, 16.64, 6.4, 2.56],
  ['#141a24', 66.56, 0, 16.64, 6.4, 2.56],
  ['#141a24', 16.64, 39.68, 16.64, 6.4, 2.56],
  ['#141a24', 66.56, 39.68, 16.64, 6.4, 2.56],
  ['var(--parking-paint)', 1.28, 3.84, 94.72, 38.4, 15.36],
  ['#c4e1ee', 17.92, 10.24, 14.08, 25.6, 5.12],
  ['#25374a', 33.28, 8.96, 32, 28.16, 6.4],
  ['#c4e1ee', 66.56, 10.24, 15.36, 25.6, 5.12],
  ['#fff0c4', 87.04, 8.96, 6.4, 6.4, 2.56],
  ['#fff0c4', 87.04, 30.72, 6.4, 6.4, 2.56],
  ['#e68978', 3.84, 8.96, 5.12, 6.4, 2.56],
  ['#e68978', 3.84, 30.72, 5.12, 6.4, 2.56],
  ['#fff', 34.56, 5.12, 38.4, 2.56, 1.28, .27],
];

function ParkingCar({ id, pose, size, active, state, register }: {
  id: number; pose: Pose; size: Point; active: boolean; state?: 'TopOfStack' | 'TemporaryHold' | 'Occupied';
  register: (node: HTMLSpanElement | null) => void;
}) {
  const label = String(id);
  return <span ref={register} className={'parking-car' + (active ? ' is-active' : '')} aria-hidden="true" data-car-number={id} data-state={state}
    style={{
      left: percent(pose.x, size[0]), top: percent(pose.y, size[1]),
      '--parking-paint': state ? `var(--car-${state})` : PAINTS[(id - 1) % PAINTS.length],
      '--number-scale': Math.min(.24, .74 / label.length),
    } as React.CSSProperties}>
    <span className="parking-car-art" style={{ transform: `rotate(${pose.angle}deg)` }}>
      {CAR_PARTS.map(([color, x, y, width, height, radius, opacity], index) => <span key={index}
        style={{ ...bounds([x, y, width, height], CAR_SIZE), background: color, borderRadius: `${percent(radius, width)} / ${percent(radius, height)}`, opacity }} />)}
    </span>
    <span className="parking-car-number">{label}</span>
  </span>;
}

type SlotState = 'Empty' | 'Occupied' | 'TopOfStack' | 'TemporaryHold';

function ParkingSlot({ label, car, state, rectangle, size, disabled, select, holding = false }: {
  label: string; car?: number; state: SlotState; rectangle: Rect; size: Point;
  disabled: boolean; select: (car: number) => void; holding?: boolean;
}) {
  return <button type="button" className={'parking-bay' + (holding ? ' holding-bay' : '')} style={bounds(rectangle, size)}
    data-state={state} aria-label={`${label}, ${car === undefined ? 'available' : `car ${car}`}`}
    disabled={disabled || car === undefined} onClick={() => { if (car !== undefined) select(car); }}>
    <span>{holding ? `#${car}` : label}</span>
  </button>;
}

type ParkingProps = {
  isStack: boolean;
  Button: React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  Feedback: React.ComponentType<{ notice: Notice | null; fallback: string }>;
  positiveInteger: (value: string) => number | null;
  parkingExitSteps: (cars: number[], target: number, isStack: boolean) => ExitStep[];
};

export default function Parking({ isStack, Button, Feedback, positiveInteger, parkingExitSteps }: ParkingProps) {
  const board = isStack ? STACK : QUEUE;
  const [number, setNumber] = useState('');
  const [cars, setCars] = useState<number[]>([]);
  const [sprites, setSprites] = useState<Scene | null>(null);
  const [waiting, setWaiting] = useState<number[]>([]);
  const [activeCar, setActiveCar] = useState<number | null>(null);
  const [events, setEvents] = useState<(EventRow & { time: Date })[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const animation = useRef<AbortController | null>(null);
  const vehicleNodes = useRef(new Map<number, HTMLSpanElement>());
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => () => animation.current?.abort(), []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [events]);

  const parkedScene = () => new Map(cars.map((id, index) => [id, bayPose(isStack, index)]));
  const show = (text: string, error = false) => setNotice({ text, error });
  const addEvent = (event: string, detail: string) => {
    const time = new Date();
    setEvents(previous => [...previous, { event, detail, time }]);
  };
  const changeCar = (value: string) => { setNumber(value); setNotice(null); };

  async function simulate(id: number, operation: 'enter' | 'exit') {
    const controller = new AbortController();
    const { signal } = controller;
    const scene = parkedScene();
    let parked = cars;
    let waitingIds: number[] = [];
    animation.current = controller;
    setBusy(true);

    function updateWaiting(ids: number[]) {
      waitingIds = ids;
      setWaiting(ids);
    }

    function publishScene() {
      setSprites(new Map(scene));
    }

    async function drive(car: number, path: Waypoint[], duration?: number) {
      if (duration === undefined) setActiveCar(car);
      if (!vehicleNodes.current.has(car)) await paintFrame(signal);
      const node = vehicleNodes.current.get(car);
      const start = scene.get(car);
      if (!node || !start) throw new Error('The car has no rendered position.');
      scene.set(car, await animatePath(node, start, path, board.size, signal, duration));
      publishScene();
    }

    async function park(car: number, slot: number) {
      const [x, y] = board.outside;
      scene.set(car, { x, y, angle: isStack ? -90 : 0 });
      publishScene();
      await paintFrame(signal);
      await drive(car, arrival(isStack, slot));
    }

    async function advanceQueue(next: number[]) {
      const crossingCar = next[4];
      if (crossingCar !== undefined) {
        const { x, y } = bayPose(false, 5);
        await drive(crossingCar, [[x - 44, y - 10, 202], [x - 65, y - 33, 270], [x - 27, 110, 340], [x + 16, 110, 360]]);
      }
      await Promise.all(next.map((car, slot) => {
        if (car === crossingCar) return;
        const target = bayPose(false, slot);
        return drive(car, [[target.x, target.y, 180]], 260);
      }));
      if (crossingCar !== undefined) await drive(crossingCar, arrival(false, 4).slice(1));
    }

    try {
      if (operation === 'enter') {
        show(`Car #${id} is entering the lot.`);
        await park(id, cars.length);
        setCars([...cars, id]);
        addEvent('Enter', `Car #${id} entered the lot`);
        show(`Car #${id} parked.`);
      } else {
        for (const step of parkingExitSteps(cars, id, isStack)) {
          if (step.event === 'Exit') {
            const slot = isStack ? parked.length - 1 : 0;
            const car = parked[slot];
            show(car === id ? `Car #${car} is exiting.` : `Car #${car} is moving to temporary waiting.`);
            if (isStack && car !== id) {
              const position = waitingIds.length;
              updateWaiting([...waitingIds, car]);
              await drive(car, holdingRoute(position));
            } else {
              await drive(car, departure(isStack, slot));
              scene.delete(car);
              publishScene();
              if (car !== id) updateWaiting([...waitingIds, car]);
            }
            if (!isStack && step.cars.length) await advanceQueue(step.cars);
          } else {
            const car = step.cars[step.cars.length - 1];
            show(`Car #${car} is returning.`);
            if (isStack) await drive(car, holdingReturn(parked.length));
            else await park(car, parked.length);
            updateWaiting(waitingIds.filter(waitingId => waitingId !== car));
          }
          parked = step.cars;
          setCars(parked);
          addEvent(step.event, step.detail);
        }
        show(`Car #${id} left the lot.`);
      }
      setNumber('');
    } catch {
      if (!signal.aborted) {
        setCars(cars);
        setEvents(events);
        show('The move was interrupted. Try again.', true);
      }
    } finally {
      if (!signal.aborted) {
        animation.current = null;
        setSprites(null);
        setWaiting([]);
        setActiveCar(null);
        setBusy(false);
        input.current?.focus();
      }
    }
  }

  function requestMove(operation: 'enter' | 'exit') {
    if (animation.current) return;
    const id = positiveInteger(number);
    if (operation === 'exit') {
      if (id === null || !cars.includes(id)) return show('Enter the number of a parked car.', true);
    } else {
      if (id === null) return show('Enter a positive whole car number.', true);
      if (cars.includes(id)) return show('That car number is already parked.', true);
      if (cars.length === CAPACITY) return show('Lot is full. Exit a car to free a slot.', true);
      if (isStack && cars.length && id <= cars[cars.length - 1]) return show('Enter a car number above the current top.', true);
    }
    void simulate(id, operation);
  }

  const scene = sprites ?? parkedScene();
  const selected = activeCar ?? positiveInteger(number);
  const selectCar = (car: number) => { changeCar(String(car)); input.current?.focus(); };
  return <div className={`animated-parking ${isStack ? 'dsa-stack blueprint-stack' : 'dsa-queue'}`}>
    <style>{isStack ? blueprintFonts + parkingStyles + blueprintStyles : parkingStyles}</style>
    <div className={'parking-lot' + (isStack ? ' blueprint-card' : '')} role="region" aria-label="Ten numbered parking slots" aria-busy={busy}>
      <div className="parking-guide"><strong>SHARED ENTRANCE / EXIT</strong><span>{isStack ? 'Last in, first out' : 'FIFO access at the front'}</span></div>
      <div className="parking-surface">
        {isStack ? <>
          <div className="blueprint-threshold"><span aria-hidden="true" className="blueprint-arrow" />ENTRANCE / EXIT · LIFO TOP</div>
          <div className="blueprint-alley" style={bounds([32, 80, 200, 514], STACK.size)} />
          <div className="blueprint-base">DEAD END · STACK BASE</div>
          <div className="blueprint-holding" style={bounds(STACK.holding, STACK.size)}>
            <h3>Temporary Holding Lane</h3>
            <p>{waiting.length ? `${waiting.length} temporarily out` : 'No cars waiting'}</p>
          </div>
          {waiting.map((car, index) => <ParkingSlot key={car} label="Temporary holding" car={car} state="TemporaryHold"
            rectangle={[293, 544 - 49 * index, 222, 47]} size={STACK.size} disabled={true} select={selectCar} holding />)}
        </> : <>
          <div className="parking-apron" style={bounds(QUEUE.apron, QUEUE.size)} />
          <div className="parking-aisle" style={bounds(QUEUE.aisle, QUEUE.size)} />
          {QUEUE.dashes.map((rect, index) => <span key={index} className="parking-dash" style={bounds(rect, QUEUE.size)} />)}
          {QUEUE.marks.map((rect, index) => <span key={index} className="parking-mark" style={bounds(rect, QUEUE.size)} />)}
          <div className="parking-waiting">WAITING{waiting.length ? ` · ${waiting.length}` : ''}</div>
        </>}
        {board.bays.map((rect, index) => {
          const car = cars[index];
          const state = car === undefined ? 'Empty' : isStack && index === cars.length - 1 ? 'TopOfStack' : 'Occupied';
          return <ParkingSlot key={index} label={`Slot ${String(index + 1).padStart(2, '0')}`} car={car}
            state={state} rectangle={rect} size={board.size} disabled={busy} select={selectCar} />;
        })}
        {[...scene].map(([id, pose]) => <ParkingCar key={id} id={id} pose={pose} size={board.size} active={id === selected}
          state={isStack ? waiting.includes(id) ? 'TemporaryHold' : id === cars[cars.length - 1] ? 'TopOfStack' : 'Occupied' : undefined}
          register={node => { if (node) vehicleNodes.current.set(id, node); else vehicleNodes.current.delete(id); }} />)}
      </div>
    </div>
    <div className="dsa-parking-controls">
      <div className={'dsa-monitor' + (isStack ? ' blueprint-card' : '')}>
        <h2>PARKING MONITOR</h2>
        <form className="dsa-control" onSubmit={event => { event.preventDefault(); requestMove('enter'); }}>
          <label className="dsa-monitor-row"><span>CAR NUMBER</span>
            <input className="dsa-input" ref={input} inputMode="numeric" autoComplete="off" placeholder="e.g. 12" value={number} readOnly={busy} onChange={event => changeCar(event.target.value)} />
          </label>
          <div className="dsa-monitor-row"><span>AVAILABLE SLOTS</span><output className="dsa-value">{CAPACITY - cars.length}{isStack ? ' / ' : ' of '}{CAPACITY}</output></div>
          <div className="dsa-actions">
            <Button type="submit" disabled={busy || cars.length === CAPACITY}>Enter Car</Button>
            <Button disabled={busy || cars.length === 0} onClick={() => requestMove('exit')}>Exit Car</Button>
          </div>
          <Feedback notice={notice} fallback="Enter a car number to begin." />
        </form>
      </div>
      <section className={'dsa-log' + (isStack ? ' blueprint-card' : '')} aria-label="Activity log">
        <div className="dsa-log-title"><h2>ACTIVITY LOG</h2>{!isStack && <span className="dsa-label">LIVE</span>}</div>
        <ol className="dsa-events" ref={log} role="log" aria-relevant="additions">
          {events.length ? events.map(({ event, detail, time }, index) => <li key={index}>
            {isStack && <time dateTime={time.toISOString()}>{time.toLocaleTimeString('en-GB')}</time>}
            <strong>{event}</strong><span>{detail}</span>
          </li>) : <li style={{ display: 'block' }}>Entry and exit events will appear here.</li>}
        </ol>
      </section>
    </div>
  </div>;
}

const parkingStyles = `
  .dsa .animated-parking { max-width: 1440px; margin-inline: auto; }
  .animated-parking .parking-lot { min-width: 0; padding: 14px; border-radius: 12px; background: var(--panel); display: grid; gap: 10px; }
  .animated-parking .parking-guide { height: 28px; min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 16px; }
  .animated-parking .parking-guide::before { content: ''; width: 7px; height: 23px; border-radius: 2px; background: var(--accent); flex: none; }
  .animated-parking .parking-guide strong { flex: 0 1 206px; color: var(--navy); font: 400 22px/1 'Bebas Neue', 'Arial Narrow', sans-serif; white-space: nowrap; }
  .animated-parking .parking-guide span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .animated-parking .parking-surface { position: relative; overflow: hidden; container-type: inline-size; height: 632px; background: #273244; border-radius: 9px; }
  .dsa-queue.animated-parking .parking-surface { height: 220px; }
  .animated-parking .parking-surface > :not(.parking-waiting) { position: absolute; }
  .animated-parking .parking-apron { background: #46546a; }
  .animated-parking .parking-aisle { background: #344155; }
  .animated-parking .parking-dash { background: #91a2b9; border-radius: 1px; opacity: .62; }
  .dsa-queue.animated-parking .parking-dash { opacity: .70; }
  .animated-parking .parking-mark { background: var(--accent); border-radius: 1px; z-index: 1; }
  .animated-parking .parking-bay, .animated-parking .parking-waiting { color: #d6dfe9; font: 400 18px/1 'Bebas Neue', 'Arial Narrow', sans-serif; }
  .animated-parking .parking-bay { background: #36455b; border: 1px solid rgba(145,162,185,.85); border-radius: 6px; padding: 0; text-align: left; cursor: pointer; }
  .animated-parking .parking-bay:disabled { opacity: 1; cursor: default; }
  .animated-parking .parking-bay span { position: absolute; top: 7px; left: 8px; }
  .animated-parking .parking-bay::after { content: ''; position: absolute; width: min(52px, 28%); height: 3px; bottom: 5px; left: 50%; transform: translateX(-50%); border-radius: 1px; background: rgba(145,162,185,.32); }
  .animated-parking .parking-waiting { position: absolute; left: 18px; top: calc(100% - 58px); z-index: 1; font-size: 16px; }
  .dsa-queue.animated-parking .parking-waiting { left: 9px; top: auto; bottom: 2px; font-size: 15px; }
  .animated-parking .parking-car { --car-width: 17.9153cqw; width: var(--car-width); aspect-ratio: 97.28 / 46.08; pointer-events: none; z-index: 2; transform: translate(-50%, -50%); }
  .dsa-queue.animated-parking .parking-car { --car-width: 7.20593cqw; }
  .animated-parking .parking-car.is-active { z-index: 3; }
  .animated-parking .parking-car.is-active::before { content: ''; position: absolute; width: 62%; aspect-ratio: 1; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 2px solid rgba(217,84,30,.8); border-radius: 50%; }
  .animated-parking .parking-car-art { position: absolute; inset: 0; }
  .animated-parking .parking-car-art > span { position: absolute; }
  .animated-parking .parking-car-number { position: absolute; inset: 0; display: grid; place-items: center; color: white; font: 700 calc(var(--car-width) * var(--number-scale))/1 'Noto Serif Gujarati', Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .dsa .animated-parking .dsa-monitor-row { grid-template-columns: minmax(0, 1fr) minmax(0, 44%); }
  .dsa .animated-parking .dsa-input::placeholder { color: #595857; }
  .dsa .animated-parking .dsa-events li span { overflow-wrap: anywhere; }
  @media (max-width: 900px) {
    .dsa .animated-parking .parking-lot { width: 100%; }
    .animated-parking .parking-guide { font-size: 13px; }
    .animated-parking .parking-guide strong { font-size: 17px; }
    .animated-parking .parking-bay { font-size: 13px; }
    .animated-parking .parking-bay span { left: 4px; }
  }
`;

const blueprintFonts = "@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');";

const blueprintStyles = `
  .dsa .blueprint-stack {
    --cream: #F5EFE6;
    --white: #FFFFFF;
    --stone: #EFECE6;
    --ink: #1C1917;
    --slate: #6E685F;
    --orange: #D95D39;
    --amber: #D99B26;
    --radius: 6px;
    --border: 1.5px solid var(--ink);
    --display: 'Space Grotesk', Arial, sans-serif;
    --mono: 'JetBrains Mono', monospace;
    --car-Occupied: var(--ink);
    --car-TopOfStack: var(--orange);
    --car-TemporaryHold: var(--amber);
    background: var(--cream);
    color: var(--ink);
    font: 500 16px/1.4 var(--display);
    grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
    gap: clamp(24px, 4vw, 56px);
    padding: 14px 4.167% 26px;
  }
  .dsa .blueprint-stack .blueprint-card { background: var(--white); color: var(--ink); border: var(--border); border-radius: var(--radius); min-width: 0; }
  .dsa .blueprint-stack .parking-lot { padding: 0; gap: 0; }
  .dsa .blueprint-stack :is(.parking-guide,.dsa-monitor > h2,.dsa-log-title) { min-height: 54px; padding: 13px 20px; border-bottom: 1px solid var(--ink); }
  .dsa .blueprint-stack .parking-guide { gap: 12px; height: auto; justify-content: space-between; }
  .dsa .blueprint-stack .parking-guide::before { display: none; }
  .dsa .blueprint-stack .parking-guide strong { flex: 0 0 auto; color: var(--ink); font: 700 clamp(14px, 1.4vw, 20px)/1.2 var(--display); }
  .dsa .blueprint-stack .parking-guide span { color: var(--slate); font: 500 clamp(12px, 1.1vw, 16px)/1.25 var(--display); }
  .dsa .blueprint-stack .parking-surface { height: 625px; background: var(--white); border-radius: 0 0 var(--radius) var(--radius); }
  .dsa .blueprint-stack .blueprint-threshold { left: 5.714%; width: 40%; top: 12px; font: 600 13px/1.25 var(--mono); }
  .dsa .blueprint-stack .blueprint-arrow { position: absolute; left: 54%; top: 28px; width: 1.5px; height: 23px; background: var(--ink); }
  .dsa .blueprint-stack .blueprint-arrow::after { content: ''; position: absolute; bottom: 0; left: -4px; width: 8px; height: 8px; border: solid var(--ink); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  .dsa .blueprint-stack .blueprint-alley { background: var(--stone); border: var(--border); border-width: 0 1.5px 2px; }
  .dsa .blueprint-stack .blueprint-base { left: 5.714%; bottom: 9px; font: 600 13px/1.25 var(--mono); }
  .dsa .blueprint-stack .blueprint-holding { background: var(--stone); border: var(--border); border-radius: var(--radius); padding: 15px 14px; }
  .dsa .blueprint-stack .blueprint-holding h3 { font: 700 clamp(14px, 1.4vw, 20px)/1.2 var(--display); }
  .dsa .blueprint-stack .blueprint-holding p { margin-top: 7px; color: var(--slate); font: 500 12px/1.3 var(--mono); }
  .dsa .blueprint-stack .parking-bay { background: transparent; border: 0; border-bottom: 1px dashed var(--slate); border-radius: 0; color: var(--slate); font: 600 14px/1 var(--mono); text-transform: uppercase; }
  .dsa .blueprint-stack .parking-bay span { top: 50%; left: 14px; transform: translateY(-50%); white-space: nowrap; }
  .dsa .blueprint-stack .parking-bay::after { display: none; }
  .dsa .blueprint-stack .parking-bay[data-state='Occupied'] { color: var(--ink); background: rgba(255,255,255,.55); }
  .dsa .blueprint-stack .parking-bay[data-state='TopOfStack'] { color: var(--ink); background: rgba(217,93,57,.13); box-shadow: inset 4px 0 var(--orange); }
  .dsa .blueprint-stack .holding-bay { color: var(--ink); background: rgba(217,155,38,.13); border: 1px solid var(--amber); border-radius: var(--radius); }
  .dsa .blueprint-stack .parking-car { --car-width: min(46px, 9.2cqw); }
  .dsa .blueprint-stack .parking-car.is-active::before { display: none; }
  .dsa .blueprint-stack .parking-car-number { font-family: var(--mono); font-weight: 600; }
  .dsa .blueprint-stack .dsa-parking-controls { grid-column: 2; padding: 0; display: grid; align-content: start; gap: 20px; }
  .dsa .blueprint-stack .dsa-monitor h2, .dsa .blueprint-stack .dsa-log h2 { margin: 0; text-align: left; font: 700 21px/1.25 var(--display); }
  .dsa .blueprint-stack .dsa-monitor > h2 { display: flex; align-items: center; }
  .dsa .blueprint-stack .dsa-control { border-radius: 0; background: transparent; color: var(--ink); padding: 18px 20px 14px; gap: 14px; }
  .dsa .blueprint-stack .dsa-monitor-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(115px, 48%); font: 700 16px/1.3 var(--display); }
  .dsa .blueprint-stack .dsa-input { border: var(--border); border-radius: var(--radius); background: var(--white); font: 500 16px/1 var(--mono); }
  .dsa .blueprint-stack .dsa-value { width: auto; height: auto; justify-self: start; background: var(--stone); border: none; border-radius: var(--radius); padding: 8px 12px; font: 600 16px/1 var(--mono); }
  .dsa .blueprint-stack .dsa-control .dsa-actions { justify-content: start; gap: 12px; }
  .dsa .blueprint-stack .dsa-button { min-height: 46px; min-width: 132px; border: var(--border); border-radius: var(--radius); color: var(--ink); background: var(--white); font: 700 19px/1.05 var(--display); letter-spacing: 0; text-transform: uppercase; }
  .dsa .blueprint-stack .dsa-button[type='submit'] { border-color: var(--orange); background: var(--orange); color: var(--white); }
  .dsa .blueprint-stack .dsa-button:disabled { color: var(--slate); border-color: var(--slate); background: var(--stone); }
  .dsa .blueprint-stack :is(button,input):focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .dsa .blueprint-stack .dsa-feedback { min-height: 24px; color: var(--slate); font: 500 14px/1.35 var(--display); }
  .dsa .blueprint-stack .dsa-feedback.error { color: var(--ink); font-weight: 700; }
  .dsa .blueprint-stack .dsa-log { margin: 0; padding: 0; gap: 0; height: 358px; grid-template-rows: auto minmax(0,1fr); }
  .dsa .blueprint-stack .dsa-events { margin: 12px; padding: 6px 10px; border-radius: var(--radius); background: var(--stone); }
  .dsa .blueprint-stack .dsa-events li { grid-template-columns: 78px 72px minmax(0,1fr); gap: 8px; padding: 8px 5px; border-bottom: 1px solid rgba(110,104,95,.25); font: 500 14px/1.3 var(--display); }
  .dsa .blueprint-stack .dsa-events li:last-child { border-bottom: 0; }
  .dsa .blueprint-stack .dsa-events strong { color: var(--ink); font: 700 13px/1.4 var(--display); letter-spacing: 0; text-transform: uppercase; }
  .dsa .blueprint-stack .dsa-events time { color: var(--slate); font: 500 12px/1.5 var(--mono); }
  @media(max-width:900px) { .dsa .blueprint-stack .dsa-parking-controls { grid-column: auto; } }
`;
