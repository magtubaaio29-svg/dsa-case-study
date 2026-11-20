import React, { useEffect, useRef, useState } from 'react';

type Point = [number, number];
type Rect = [number, number, number, number];
type Waypoint = [x: number, y: number, angle: number];
type Pose = { x: number; y: number; angle: number; duration: number };
type Scene = Map<number, Pose>;
type EventRow = { event: string; detail: string };
type ExitStep = EventRow & { cars: number[] };
type Notice = { text: string; error: boolean };

const CAPACITY = 10;
const BAY_NUMBERS = Array.from({ length: CAPACITY }, (_, index) => index);
const PAINTS = ['#4d9a91', '#789cce', '#e2aa60'];
const STACK = {
  size: [543, 632] as Point,
  bays: BAY_NUMBERS.map((index): Rect => [index < 5 ? 18 : 329.5, 18 + 106 * (index % 5), 195.5, 94]),
  aisle: [213.5, 0, 116, 568] as Rect,
  apron: [0, 570, 543, 62] as Rect,
  marks: [[216.5, 566, 28, 4], [298.5, 566, 28, 4]] as Rect[],
  dashes: Array.from({ length: 8 }, (_, index): Rect => [270.5, 25 + 66 * index, 2, 25]),
  outside: [271.5, 689] as Point,
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
  return { x: x + width / 2, y: y + height / 2, angle: isStack && index < 5 ? 0 : 180, duration: 0 };
}

function arrival(isStack: boolean, index: number): Waypoint[] {
  const { x, y, angle } = bayPose(isStack, index);
  if (isStack) {
    const side = index < 5 ? -1 : 1;
    return [[271.5, 577, -90], [271.5, y - 32, -90], [271.5 + 20 * side, y - 16, index < 5 ? -34 : -146], [x, y, angle]];
  }
  const side = index < 5 ? -1 : 1;
  return [[132, 110, 0], [x + 58, 110, 0], [x + 67, y - 31 * side, 90 * side], [x + 36, y - 6 * side, 155 * side], [x, y, angle]];
}

function departure(isStack: boolean, index: number): Waypoint[] {
  const { x, y } = bayPose(isStack, index);
  if (isStack) {
    const side = index < 5 ? -1 : 1;
    return [[271.5 + 36 * side, y, index < 5 ? 0 : 180], [271.5, y + 38, 90], [271.5, 570, 90], [...STACK.outside, 90]];
  }
  return [[x - 39, (y + 110) / 2, index < 5 ? 145 : 215], [x - 74, 110, 180], [132, 110, 180], [...QUEUE.outside, 180]];
}

function motionPause(duration: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (duration === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, duration);
    signal.addEventListener('abort', cancel, { once: true });
  });
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

function ParkingCar({ id, pose, size, active }: { id: number; pose: Pose; size: Point; active: boolean }) {
  const label = String(id);
  return <span className={'parking-car' + (active ? ' is-active' : '')} aria-hidden="true" data-car-number={id}
    style={{
      left: percent(pose.x, size[0]), top: percent(pose.y, size[1]),
      '--parking-paint': PAINTS[(id - 1) % PAINTS.length], '--drive-time': `${pose.duration}ms`,
      '--drive-angle': `${pose.angle}deg`, '--number-scale': Math.min(.211, .74 / label.length),
    } as React.CSSProperties}>
    <span className="parking-car-art">
      {CAR_PARTS.map(([color, x, y, width, height, radius, opacity], index) => <span key={index}
        style={{ ...bounds([x, y, width, height], CAR_SIZE), background: color, borderRadius: `${percent(radius, width)} / ${percent(radius, height)}`, opacity }} />)}
    </span>
    <span className="parking-car-number">{label}</span>
  </span>;
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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const animation = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => () => animation.current?.abort(), []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [events]);

  const parkedScene = () => new Map(cars.map((id, index) => [id, bayPose(isStack, index)]));
  const show = (text: string, error = false) => setNotice({ text, error });
  const addEvent = (event: string, detail: string) => setEvents(previous => [...previous, { event, detail }]);
  const changeCar = (value: string) => { setNumber(value); setNotice(null); };

  async function simulate(id: number, operation: 'enter' | 'exit') {
    const controller = new AbortController();
    const { signal } = controller;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    async function drive(car: number, path: Waypoint[]) {
      setActiveCar(car);
      for (const [x, y, heading] of path) {
        const previous = scene.get(car)!;
        const turn = ((heading - previous.angle + 540) % 360) - 180;
        const distance = Math.hypot(x - previous.x, y - previous.y);
        const duration = reducedMotion ? 0 : Math.min(320, Math.round(86 + .24 * distance + .45 * Math.abs(turn)));
        scene.set(car, { x, y, angle: previous.angle + turn, duration });
        publishScene();
        await motionPause(duration, signal);
      }
    }

    async function park(car: number, slot: number) {
      const [x, y] = board.outside;
      scene.set(car, { x, y, angle: isStack ? -90 : 0, duration: 0 });
      publishScene();
      await motionPause(reducedMotion ? 0 : 32, signal);
      await drive(car, arrival(isStack, slot));
    }

    async function advanceQueue(next: number[]) {
      const crossingCar = next[4];
      if (crossingCar !== undefined) await drive(crossingCar, departure(false, 5).slice(0, 2));
      next.forEach((car, slot) => {
        if (car !== crossingCar) scene.set(car, { ...bayPose(false, slot), duration: reducedMotion ? 0 : 220 });
      });
      publishScene();
      await motionPause(reducedMotion ? 0 : 220, signal);
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
            await drive(car, departure(isStack, slot));
            scene.delete(car);
            publishScene();
            if (car !== id) updateWaiting([...waitingIds, car]);
            if (!isStack && step.cars.length) await advanceQueue(step.cars);
          } else {
            const car = step.cars[step.cars.length - 1];
            updateWaiting(waitingIds.filter(waitingId => waitingId !== car));
            show(`Car #${car} is returning.`);
            await park(car, parked.length);
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
  return <div className={`animated-parking ${isStack ? 'dsa-stack' : 'dsa-queue'}`}>
    <style>{parkingStyles}</style>
    <div className="parking-lot" role="region" aria-label="Ten numbered parking slots" aria-busy={busy}>
      <div className="parking-guide"><strong>SHARED ENTRANCE / EXIT</strong><span>{isStack ? 'LIFO access at the top' : 'FIFO access at the front'}</span></div>
      <div className="parking-surface">
        <div className="parking-apron" style={bounds(board.apron, board.size)} />
        <div className="parking-aisle" style={bounds(board.aisle, board.size)} />
        {board.dashes.map((rect, index) => <span key={index} className="parking-dash" style={bounds(rect, board.size)} />)}
        {board.marks.map((rect, index) => <span key={index} className="parking-mark" style={bounds(rect, board.size)} />)}
        {board.bays.map((rect, index) => {
          const car = cars[index];
          const slot = `Slot ${String(index + 1).padStart(2, '0')}`;
          return <button type="button" className="parking-bay" key={index} style={bounds(rect, board.size)}
            aria-label={`${slot}, ${car === undefined ? 'available' : `car ${car}`}`} disabled={busy || car === undefined}
            onClick={() => { changeCar(String(car)); input.current?.focus(); }}>
            <span>{slot}</span>
          </button>;
        })}
        <div className="parking-waiting" title={waiting.length ? waiting.map(id => `Car #${id}`).join(', ') : undefined}>
          {isStack ? 'TEMPORARY WAITING' : 'WAITING'}{waiting.length ? ` · ${waiting.length}` : ''}
        </div>
        {[...scene].map(([id, pose]) => <ParkingCar key={id} id={id} pose={pose} size={board.size} active={id === selected} />)}
      </div>
    </div>
    {isStack && <div className="dsa-lane-divider" />}
    <div className="dsa-parking-controls">
      <div className="dsa-monitor">
        <h2>PARKING MONITOR</h2>
        <form className="dsa-control" onSubmit={event => { event.preventDefault(); requestMove('enter'); }}>
          <label className="dsa-monitor-row"><span>CAR NUMBER</span>
            <input className="dsa-input" ref={input} inputMode="numeric" autoComplete="off" placeholder="Enter a car number" value={number} readOnly={busy} onChange={event => changeCar(event.target.value)} />
          </label>
          <div className="dsa-monitor-row"><span>AVAILABLE SLOTS</span><output className="dsa-value">{CAPACITY - cars.length} of {CAPACITY}</output></div>
          <div className="dsa-actions">
            <Button type="submit" disabled={busy || cars.length === CAPACITY}>Enter Car</Button>
            <Button disabled={busy || cars.length === 0} onClick={() => requestMove('exit')}>Exit Car</Button>
          </div>
          <Feedback notice={notice} fallback="Enter a car number to begin." />
        </form>
      </div>
      <section className="dsa-log" aria-label="Activity log">
        <div className="dsa-log-title"><h2>ACTIVITY LOG</h2><span className="dsa-label"></span></div>
        <ol className="dsa-events" ref={log} role="log" aria-relevant="additions">
          {events.length ? events.map(({ event, detail }, index) => <li key={index}><strong>{event}</strong><span>{detail}</span></li>) : <li style={{ display: 'block' }}>Entry and exit events will appear here.</li>}
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
  .animated-parking .parking-car { --car-width: 17.9153cqw; width: var(--car-width); aspect-ratio: 97.28 / 46.08; pointer-events: none; z-index: 2; transform: translate(-50%, -50%); transition: left var(--drive-time) ease-in-out, top var(--drive-time) ease-in-out; }
  .dsa-queue.animated-parking .parking-car { --car-width: 7.20593cqw; }
  .animated-parking .parking-car.is-active { z-index: 3; }
  .animated-parking .parking-car.is-active::before { content: ''; position: absolute; width: 62%; aspect-ratio: 1; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 2px solid rgba(217,84,30,.8); border-radius: 50%; }
  .animated-parking .parking-car-art { position: absolute; inset: 0; transform: rotate(var(--drive-angle)); transition: transform var(--drive-time) ease-in-out; }
  .animated-parking .parking-car-art > span { position: absolute; }
  .animated-parking .parking-car-number { position: absolute; inset: 0; display: grid; place-items: center; color: white; font: 700 calc(var(--car-width) * var(--number-scale))/1 'Noto Serif Gujarati', Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .dsa .animated-parking .dsa-monitor-row { grid-template-columns: minmax(0, 1fr) minmax(0, 44%); }
  .dsa .animated-parking .dsa-input::placeholder { color: #595857; }
  .dsa .animated-parking .dsa-events li span { overflow-wrap: anywhere; }
  @media (prefers-reduced-motion: reduce) { .animated-parking .parking-car, .animated-parking .parking-car-art { transition: none; } }
  @media (max-width: 900px) {
    .dsa .animated-parking .parking-lot { width: 100%; }
    .animated-parking .parking-guide { font-size: 13px; }
    .animated-parking .parking-guide strong { font-size: 17px; }
    .animated-parking .parking-bay { font-size: 13px; }
    .animated-parking .parking-bay span { left: 4px; }
  }
`;
