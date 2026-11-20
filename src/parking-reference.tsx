import React, { useEffect, useRef, useState } from "react";

type Point = [number, number];
type Box = [number, number, number, number];
type Waypoint = [
  x: number,
  y: number,
  angle: number,
  scale?: number,
];
type Pose = {
  x: number;
  y: number;
  angle: number;
  scale?: number;
};
type LogRow = { event: string; detail: string };
type ExitStep = LogRow & { cars: number[] };
type Notice = { text: string; error: boolean };

const CAPACITY = 10;
const slots = Array.from(
  { length: CAPACITY },
  (_, index) => index,
);
const STACK_X = 285.5;
const STACK_GATE = 680;
const STACK = {
  size: [571, 700] as Point,
  bays: slots.map((index): Box => [
    index < 5 ? 25 : 316,
    32 + 133 * (index % 5),
    230,
    105,
  ]),
  aisle: [STACK_X - 30.5, 25, 61, 648] as Box,
  gate: [STACK_X, STACK_GATE] as Point,
  outside: [STACK_X, 752] as Point,
};
const QUEUE_WIDTH = 1378;
const QUEUE_HEIGHT = 365;
const QUEUE_FRONT_Y = 76;
const QUEUE_REAR_Y = 194;
const QUEUE_LANE_HEIGHT = 90;
const QUEUE_LANE_X = 260;
const QUEUE_TURN_X = 1248;
const QUEUE_TURN_RADIUS = (QUEUE_REAR_Y - QUEUE_FRONT_Y) / 2;
const QUEUE_BAY_WIDTH = (QUEUE_TURN_X - QUEUE_LANE_X) / 5;
const QUEUE_APRON_X = 86;
const QUEUE_OUTSIDE_X = -66;
const QUEUE_FRONT_TURN = 42;
const QUEUE_REAR_TURN = 30;
const HOLDING = {
  capacity: CAPACITY - 1,
  width: 814,
  top: 251,
  aisleY: 294,
  aisleWidth: 43,
  stallTop: 316,
  stallHeight: 44,
  scale: 0.4,
  bend: 30,
};
const HOLDING_X = QUEUE_APRON_X + HOLDING.bend;
const HOLDING_BEND_Y = HOLDING.aisleY - HOLDING.bend;
const HOLDING_PARK_Y =
  HOLDING.stallTop + HOLDING.stallHeight / 2;
const HOLDING_PARK_RADIUS =
  (HOLDING_PARK_Y - HOLDING.aisleY) / 2;
const HOLDING_PARK_BEND_Y =
  HOLDING.aisleY + HOLDING_PARK_RADIUS;
const QUEUE = {
  size: [QUEUE_WIDTH, QUEUE_HEIGHT] as Point,
  bays: slots.map((index): Box => {
    const upper = index < 5;
    const column = upper ? index : CAPACITY - 1 - index;
    const laneY = upper ? QUEUE_FRONT_Y : QUEUE_REAR_Y;
    return [
      QUEUE_LANE_X + QUEUE_BAY_WIDTH * column,
      laneY - QUEUE_LANE_HEIGHT / 2,
      QUEUE_BAY_WIDTH,
      QUEUE_LANE_HEIGHT,
    ];
  }),
  outside: [QUEUE_OUTSIDE_X, QUEUE_REAR_Y] as Point,
};

function percent(value: number, total: number) {
  return `${(100 * value) / total}%`;
}

function rect(
  [x, y, width, height]: Box,
  [boardWidth, boardHeight]: Point,
): React.CSSProperties {
  return {
    left: percent(x, boardWidth),
    top: percent(y, boardHeight),
    width: percent(width, boardWidth),
    height: percent(height, boardHeight),
  };
}

function bayPose(isStack: boolean, slot: number): Pose {
  const [x, y, width, height] = (isStack ? STACK : QUEUE).bays[
    slot
  ];
  return {
    x: x + width / 2,
    y: y + height * (isStack ? 0.53 : 0.5),
    angle: slot < 5 ? (isStack ? 0 : 180) : isStack ? 180 : 0,
  };
}

// Sample the same circle the road uses and keep the car tangent to it.
function queueArc(
  x: number,
  y: number,
  radius: number,
  from: number,
  to: number,
): Waypoint[] {
  const turn = to - from;
  const samples = Math.ceil(Math.abs(turn) / 12);
  const tangent = Math.sign(turn) * 90;
  return Array.from(
    { length: samples + 1 },
    (_, index): Waypoint => {
      const bearing = from + (turn * index) / samples;
      const radians = (bearing * Math.PI) / 180;
      return [
        x + radius * Math.cos(radians),
        y + radius * Math.sin(radians),
        bearing + tangent,
      ];
    },
  );
}

const queueTurn = queueArc(
  QUEUE_TURN_X,
  QUEUE_FRONT_Y + QUEUE_TURN_RADIUS,
  QUEUE_TURN_RADIUS,
  90,
  -90,
);
const holdingBendIn = queueArc(
  HOLDING_X,
  HOLDING_BEND_Y,
  HOLDING.bend,
  180,
  90,
);
const holdingBendOut = queueArc(
  HOLDING_X,
  HOLDING_BEND_Y,
  HOLDING.bend,
  90,
  180,
);

function queueArrival(slot: number): Waypoint[] {
  const { x, y, angle } = bayPose(false, slot);
  return slot < 5
    ? [...queueTurn, [x, y, angle]]
    : [[x, y, angle]];
}

function arrival(isStack: boolean, slot: number): Waypoint[] {
  if (!isStack)
    return [
      [QUEUE_LANE_X, QUEUE_REAR_Y, 0],
      ...queueArrival(slot),
    ];
  const { x, y, angle } = bayPose(isStack, slot);
  const side = slot < 5 ? -1 : 1;
  return [
    [STACK_X, STACK_GATE, -90],
    [STACK_X, y - 34, -90],
    [STACK_X + 22 * side, y - 16, slot < 5 ? -34 : -146],
    [x, y, angle],
  ];
}

function departure(isStack: boolean, slot: number): Waypoint[] {
  if (!isStack)
    return [
      [QUEUE_LANE_X, QUEUE_FRONT_Y, 180],
      [QUEUE_OUTSIDE_X, QUEUE_FRONT_Y, 180],
    ];
  const { y, angle } = bayPose(isStack, slot);
  const side = slot < 5 ? -1 : 1;
  return [
    [STACK_X + 35 * side, y, angle],
    [STACK_X, y + 39, 90],
    [STACK_X, STACK_GATE, 90],
    [...STACK.outside, 90],
  ];
}

function queueToHolding(space: number): Waypoint[] {
  const x =
    HOLDING_X +
    (HOLDING.width * (space + 0.5)) / HOLDING.capacity;
  const approachX = QUEUE_APRON_X + QUEUE_FRONT_TURN;
  const [start, ...frontBend] = queueArc(
    approachX,
    QUEUE_FRONT_Y + QUEUE_FRONT_TURN,
    QUEUE_FRONT_TURN,
    -90,
    -180,
  );
  // Turn into the space from the aisle and stop lengthwise, pointed toward the shared gate.
  const stallBend = queueArc(
    x,
    HOLDING_PARK_BEND_Y,
    HOLDING_PARK_RADIUS,
    -90,
    90,
  );
  return [
    [QUEUE_LANE_X, QUEUE_FRONT_Y, 180],
    [start[0], start[1], start[2], HOLDING.scale],
    ...frontBend,
    ...holdingBendIn,
    ...stallBend,
  ];
}

function queueFromHolding(x: number, slot: number): Waypoint[] {
  const pullOut = queueArc(
    x,
    HOLDING_PARK_BEND_Y,
    HOLDING_PARK_RADIUS,
    90,
    180,
  );
  const merge = queueArc(
    x - 2 * HOLDING_PARK_RADIUS,
    HOLDING_PARK_BEND_Y,
    HOLDING_PARK_RADIUS,
    0,
    -90,
  );
  const rearBend = queueArc(
    QUEUE_APRON_X + QUEUE_REAR_TURN,
    QUEUE_REAR_Y + QUEUE_REAR_TURN,
    QUEUE_REAR_TURN,
    180,
    270,
  );
  return [
    ...pullOut.slice(1),
    ...merge.slice(1),
    ...holdingBendOut,
    ...rearBend,
    [QUEUE_LANE_X, QUEUE_REAR_Y, 0, 1],
    ...queueArrival(slot),
  ];
}

function afterPaint(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    });
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function carTransform(scale = 1) {
  return `translate(-50%, -50%) scale(${scale})`;
}

async function animateCar(
  node: HTMLSpanElement,
  start: Pose,
  path: Waypoint[],
  size: Point,
  signal: AbortSignal,
  isQueue: boolean,
  segmentTime?: number,
) {
  if (signal.aborted) throw signal.reason;
  const frames = [{ ...start, time: 0 }];
  for (const [x, y, heading, scale] of path) {
    const previous = frames[frames.length - 1];
    const turn =
      ((((heading - previous.angle) % 360) + 540) % 360) - 180;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    const duration =
      segmentTime ??
      (isQueue
        ? Math.max(12, 0.45 * distance + 0.42 * Math.abs(turn))
        : Math.min(
            520,
            Math.round(
              94 + 0.4 * distance + 0.48 * Math.abs(turn),
            ),
          ));
    frames.push({
      x,
      y,
      angle: previous.angle + turn,
      scale: scale ?? previous.scale,
      time: previous.time + duration,
    });
  }
  const end = frames[frames.length - 1];
  const art = node.firstElementChild as HTMLElement;
  const position = (pose: Pose) => ({
    left: percent(pose.x, size[0]),
    top: percent(pose.y, size[1]),
    transform: carTransform(pose.scale),
  });
  const rotation = (pose: Pose) => ({
    transform: `rotate(${pose.angle}deg)`,
  });
  if (
    !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
  ) {
    const options: KeyframeAnimationOptions = {
      duration: end.time,
      fill: "forwards",
      easing: "ease-in-out",
    };
    const travel = node.animate(
      frames.map((pose) => ({
        ...position(pose),
        offset: pose.time / end.time,
      })),
      options,
    );
    const turn = art.animate(
      frames.map((pose) => ({
        ...rotation(pose),
        offset: pose.time / end.time,
      })),
      options,
    );
    const stop = () => {
      travel.cancel();
      turn.cancel();
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      await Promise.all([travel.finished, turn.finished]);
      Object.assign(node.style, position(end));
      Object.assign(art.style, rotation(end));
    } finally {
      signal.removeEventListener("abort", stop);
      stop();
    }
  }
  return {
    x: end.x,
    y: end.y,
    angle: end.angle,
    scale: end.scale,
  };
}

const bodySize: Point = [97.28, 46.08];
const paint = ["#4d9a91", "#789cce", "#e2aa60"];
const queuePaint = [...paint, "#cd7486", "#a68bd0"];
const parts: Array<[string, Box, number, number?]> = [
  ["#141a24", [2.56, 3.84, 92.16, 42.24], 16.64, 0.5],
  ["#141a24", [16.64, 0, 16.64, 6.4], 2.56],
  ["#141a24", [66.56, 0, 16.64, 6.4], 2.56],
  ["#141a24", [16.64, 39.68, 16.64, 6.4], 2.56],
  ["#141a24", [66.56, 39.68, 16.64, 6.4], 2.56],
  ["var(--car-paint)", [1.28, 3.84, 94.72, 38.4], 15.36],
  ["#c4e1ee", [17.92, 10.24, 14.08, 25.6], 5.12],
  ["#25374a", [33.28, 8.96, 32, 28.16], 6.4],
  ["#c4e1ee", [66.56, 10.24, 15.36, 25.6], 5.12],
  ["#fff0c4", [87.04, 8.96, 6.4, 6.4], 2.56],
  ["#fff0c4", [87.04, 30.72, 6.4, 6.4], 2.56],
  ["#e68978", [3.84, 8.96, 5.12, 6.4], 2.56],
  ["#e68978", [3.84, 30.72, 5.12, 6.4], 2.56],
  ["#fff", [34.56, 5.12, 38.4, 2.56], 1.28, 0.27],
];

function Car({
  id,
  pose,
  size,
  moving,
  isQueue,
  isHeld,
  register,
}: {
  id: number;
  pose: Pose;
  size: Point;
  moving: boolean;
  isQueue: boolean;
  isHeld: boolean;
  register: (node: HTMLSpanElement | null) => void;
}) {
  const label = isQueue
    ? String(id).padStart(2, "0")
    : String(id);
  const palette = isQueue ? queuePaint : paint;
  const color = palette[(id - 1) % palette.length];
  return (
    <span
      ref={register}
      aria-hidden="true"
      data-car-number={id}
      data-holding={isQueue && isHeld}
      className={`ref-car${moving ? " moving" : ""}`}
      style={
        {
          left: percent(pose.x, size[0]),
          top: percent(pose.y, size[1]),
          transform: carTransform(pose.scale),
          "--car-paint": color,
          "--plate-scale": Math.min(0.218, 0.58 / label.length),
        } as React.CSSProperties
      }
    >
      <span
        className="ref-car-art"
        style={{ transform: `rotate(${pose.angle}deg)` }}
      >
        {parts.map(([color, box, radius, opacity], index) => (
          <span
            key={index}
            style={{
              ...rect(box, bodySize),
              background: color,
              borderRadius: `${percent(radius, box[2])} / ${percent(radius, box[3])}`,
              opacity,
            }}
          />
        ))}
      </span>
      <span className="ref-plate">{label}</span>
    </span>
  );
}

type ParkingProps = {
  isStack: boolean;
  Button: React.ComponentType<
    React.ButtonHTMLAttributes<HTMLButtonElement>
  >;
  Feedback: React.ComponentType<{
    notice: Notice | null;
    fallback: string;
  }>;
  positiveInteger: (raw: string) => number | null;
  parkingExitSteps: (
    cars: number[],
    target: number,
    isStack: boolean,
  ) => ExitStep[];
};

function QueueMap({ held }: { held: number }) {
  const upper = QUEUE_FRONT_Y;
  const lower = QUEUE_REAR_Y;
  const apronTop = upper - QUEUE_LANE_HEIGHT / 2;
  const apronBottom = lower + QUEUE_LANE_HEIGHT / 2;
  const center = (upper + lower) / 2;
  const spurHalf = (HOLDING.aisleWidth + 2) / 2;
  const crossingHalf = spurHalf + 9;
  const apronCenterline = `M 0 ${center} H ${QUEUE_APRON_X - crossingHalf} M ${QUEUE_APRON_X + crossingHalf} ${center} H ${QUEUE_LANE_X}`;
  const islandWidth = QUEUE_TURN_X - QUEUE_LANE_X - 12;
  const lane = `M ${QUEUE_LANE_X} ${upper} H ${QUEUE_TURN_X} A ${QUEUE_TURN_RADIUS} ${QUEUE_TURN_RADIUS} 0 0 1 ${QUEUE_TURN_X} ${lower} H ${QUEUE_LANE_X}`;
  const holdingLane = `M ${QUEUE_APRON_X} ${apronBottom} V ${HOLDING_BEND_Y} A ${HOLDING.bend} ${HOLDING.bend} 0 0 0 ${HOLDING_X} ${HOLDING.aisleY} H ${HOLDING_X + HOLDING.width - 9}`;
  return (
    <>
      <svg
        className="queue-map"
        viewBox={`0 0 ${QUEUE_WIDTH} ${QUEUE_HEIGHT}`}
        aria-hidden="true"
      >
        <rect
          width={QUEUE_WIDTH}
          height="244"
          rx="11"
          fill="var(--panel)"
        />
        <path
          d={lane}
          stroke="#f3eee3"
          strokeWidth={QUEUE_LANE_HEIGHT + 4}
          fill="none"
        />
        <path
          d={lane}
          stroke="var(--navy)"
          strokeWidth={QUEUE_LANE_HEIGHT}
          fill="none"
        />
        <path
          d={`M 0 ${apronTop} H ${QUEUE_LANE_X} M 0 ${apronBottom} H ${QUEUE_APRON_X - spurHalf} M ${QUEUE_APRON_X + spurHalf} ${apronBottom} H ${QUEUE_LANE_X}`}
          stroke="#a6a6a5"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d={apronCenterline}
          stroke="#a9aaad"
          strokeWidth="6"
          fill="none"
        />
        <path
          className="queue-apron-centerline"
          d={apronCenterline}
          stroke="#fff"
          strokeWidth="4"
          fill="none"
        />
        <rect
          className="queue-island"
          x={QUEUE_LANE_X}
          y={center - 6}
          width={islandWidth}
          height="12"
          rx="6"
          fill="#b8b8ba"
        />
        {[1, 2, 3, 4].map((column) => {
          const x = QUEUE_LANE_X + QUEUE_BAY_WIDTH * column;
          return (
            <g key={column}>
              <path
                d={`M ${x} ${upper - 44} v 28 m 0 32 v 28 M ${x} ${lower - 44} v 28 m 0 32 v 28`}
                stroke="#ffffff"
                strokeOpacity=".65"
                strokeWidth="1.5"
              />
              <path
                d="M -12 0 H 9 M 3 -5 l6 5 -6 5"
                transform={`translate(${x} ${upper}) rotate(180)`}
                stroke="#f3eee3"
                strokeWidth="2.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M -12 0 H 9 M 3 -5 l6 5 -6 5"
                transform={`translate(${x} ${lower})`}
                stroke="#f3eee3"
                strokeWidth="2.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </g>
          );
        })}
        <path
          d="M 1289 177 A 59 59 0 0 0 1289 93 m 2 14 -2 -14 14 2"
          stroke="#f3eee3"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M 177 76 H 122 l11 -8 m -11 8 11 8 M 122 194 h 55 l-11 -8 m 11 8 -11 8"
          stroke="var(--navy)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <text
          className="queue-lane-label"
          x="151"
          y="58"
          textAnchor="middle"
        >
          FRONT · EXIT
        </text>
        <text
          className="queue-lane-label"
          x="151"
          y="176"
          textAnchor="middle"
        >
          REAR · ENTER
        </text>
        <rect
          x={HOLDING_X}
          y={HOLDING.top}
          width={HOLDING.width}
          height={
            HOLDING.stallTop + HOLDING.stallHeight - HOLDING.top
          }
          rx="8"
          fill="var(--queue-hold-fill)"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <path
          d={holdingLane}
          fill="none"
          stroke="#a6a6a5"
          strokeWidth={HOLDING.aisleWidth + 2}
        />
        <path
          d={holdingLane}
          fill="none"
          stroke="var(--panel)"
          strokeWidth={HOLDING.aisleWidth}
        />
        <path
          d={holdingLane}
          fill="none"
          stroke="#a3a3a3"
          strokeWidth="1.4"
          strokeDasharray="9 13"
        />
      </svg>
      <div
        className="queue-hold-heading"
        style={rect(
          [HOLDING_X + 10, HOLDING.top, HOLDING.width - 20, 24],
          QUEUE.size,
        )}
      >
        <h3 id="queue-hold-title">HOLDING BAY</h3>
        <span data-holding-count={held}>
          {held} / {HOLDING.capacity} held
        </span>
      </div>
      <div
        className="queue-hold-spaces"
        role="group"
        aria-labelledby="queue-hold-title"
        style={rect(
          [
            HOLDING_X,
            HOLDING.stallTop,
            HOLDING.width,
            HOLDING.stallHeight,
          ],
          QUEUE.size,
        )}
      >
        {Array.from(
          { length: HOLDING.capacity },
          (_, index) => (
            <span
              key={index}
              data-holding-space={index + 1}
              aria-hidden="true"
            />
          ),
        )}
      </div>
    </>
  );
}

export default function Parking({
  isStack,
  Button,
  Feedback,
  positiveInteger,
  parkingExitSteps,
}: ParkingProps) {
  const board = isStack ? STACK : QUEUE;
  const [number, setNumber] = useState("");
  const [cars, setCars] = useState<number[]>([]);
  const [sprites, setSprites] = useState<Map<
    number,
    Pose
  > | null>(null);
  const [movingCar, setMovingCar] = useState<number | null>(
    null,
  );
  const [waiting, setWaiting] = useState<number[]>([]);
  const [events, setEvents] = useState<LogRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const spritesById = useRef(
    new Map<number, HTMLSpanElement>(),
  );
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    if (log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [events]);

  const parkedPoses = () =>
    new Map(
      cars.map((id, slot) => [id, bayPose(isStack, slot)]),
    );
  const show = (text: string, error = false) =>
    setNotice({ text, error });
  const record = (event: string, detail: string) =>
    setEvents((current) => [...current, { event, detail }]);
  const changeNumber = (raw: string) => {
    setNumber(raw);
    setNotice(null);
  };

  async function run(id: number, action: "enter" | "exit") {
    const controller = new AbortController();
    const { signal } = controller;
    const scene = parkedPoses();
    let parked = cars;
    let outside: number[] = [];
    operation.current = controller;
    setBusy(true);

    const render = () => setSprites(new Map(scene));
    const setOutside = (ids: number[]) => {
      outside = ids;
      setWaiting(ids);
    };

    async function drive(
      car: number,
      route: Waypoint[],
      duration?: number,
    ) {
      if (duration === undefined) setMovingCar(car);
      if (!spritesById.current.has(car))
        await afterPaint(signal);
      const element = spritesById.current.get(car);
      const from = scene.get(car);
      if (!element || !from)
        throw new Error(
          "Car is missing from the animation surface.",
        );
      scene.set(
        car,
        await animateCar(
          element,
          from,
          route,
          board.size,
          signal,
          !isStack,
          duration,
        ),
      );
      render();
    }

    async function enterLot(car: number, slot: number) {
      const [x, y] = board.outside;
      scene.set(car, { x, y, angle: isStack ? -90 : 0 });
      render();
      await afterPaint(signal);
      await drive(car, arrival(isStack, slot));
    }

    async function advanceQueue(remaining: number[]) {
      await Promise.all(
        remaining.map((car, slot) => {
          if (slot === 4) return drive(car, queueArrival(slot));
          const target = bayPose(false, slot);
          return drive(
            car,
            [[target.x, target.y, target.angle]],
            260,
          );
        }),
      );
    }

    try {
      if (action === "enter") {
        show(`Car #${id} is entering the lot.`);
        await enterLot(id, parked.length);
        setCars([...parked, id]);
        record("Enter", `Car #${id} entered the lot`);
        show(`Car #${id} parked.`);
      } else {
        for (const step of parkingExitSteps(
          cars,
          id,
          isStack,
        )) {
          if (step.event === "Exit") {
            const slot = isStack ? parked.length - 1 : 0;
            const car = parked[slot];
            const stage = !isStack && car !== id;
            show(
              car === id
                ? `Car #${car} is exiting.`
                : stage
                  ? `Car #${car} is moving to holding.`
                  : `Car #${car} is moving out temporarily.`,
            );
            if (stage)
              await drive(car, queueToHolding(outside.length));
            else {
              await drive(car, departure(isStack, slot));
              scene.delete(car);
              render();
            }
            if (car !== id) setOutside([...outside, car]);
            setCars(step.cars);
            record(
              step.event,
              stage
                ? `Car #${car} moved to holding`
                : step.detail,
            );
            if (!isStack && step.cars.length)
              await advanceQueue(step.cars);
          } else {
            const car = step.cars[step.cars.length - 1];
            show(
              isStack
                ? `Car #${car} is returning.`
                : `Car #${car} is rejoining at the rear.`,
            );
            if (isStack) await enterLot(car, parked.length);
            else {
              const held = scene.get(car);
              if (!held)
                throw new Error(
                  "The waiting car is missing from its holding space.",
                );
              await drive(
                car,
                queueFromHolding(held.x, parked.length),
              );
            }
            setOutside(
              outside.filter((waitingId) => waitingId !== car),
            );
            setCars(step.cars);
            record(
              step.event,
              isStack
                ? step.detail
                : `Car #${car} rejoined at the rear`,
            );
          }
          parked = step.cars;
        }
        show(`Car #${id} left the lot.`);
      }
      setNumber("");
    } catch {
      if (!signal.aborted) {
        setCars(cars);
        setEvents(events);
        show("The move was interrupted. Try again.", true);
      }
    } finally {
      if (!signal.aborted) {
        operation.current = null;
        setSprites(null);
        setWaiting([]);
        setMovingCar(null);
        setBusy(false);
        input.current?.focus();
      }
    }
  }

  function move(action: "enter" | "exit") {
    if (operation.current) return;
    const id = positiveInteger(number);
    if (action === "exit") {
      if (id === null || !cars.includes(id))
        return show("Enter the number of a parked car.", true);
    } else {
      if (id === null)
        return show("Enter a positive whole car number.", true);
      if (cars.includes(id))
        return show("That car number is already parked.", true);
      if (cars.length === CAPACITY)
        return show(
          "Lot is full. Exit a car to free a slot.",
          true,
        );
      if (isStack && cars.length && id <= cars[cars.length - 1])
        return show(
          "Enter a car number above the current top.",
          true,
        );
    }
    void run(id, action);
  }

  const selected = positiveInteger(number);
  return (
    <div
      className={`reference-parking ${isStack ? "ref-stack" : "ref-queue"}`}
    >
      <style>{parkingStyles}</style>
      <div
        className="ref-lot"
        role="region"
        aria-label="Ten numbered parking slots"
        aria-busy={busy}
      >
        <div
          className={
            isStack
              ? "ref-surface"
              : "ref-surface queue-surface"
          }
        >
          {isStack ? (
            <span
              className="ref-aisle"
              aria-hidden="true"
              style={rect(STACK.aisle, STACK.size)}
            />
          ) : (
            <QueueMap held={waiting.length} />
          )}
          {board.bays.map((box, slot) => {
            const car = cars[slot];
            const end = isStack
              ? slot === cars.length - 1
              : slot === 0;
            return (
              <button
                key={slot}
                type="button"
                className="ref-bay"
                style={rect(box, board.size)}
                aria-label={`Slot ${String(slot + 1).padStart(2, "0")}, ${car === undefined ? "available" : `car ${car}${!isStack && end ? ", front of queue" : ""}`}`}
                data-selected={
                  car !== undefined && selected === car
                }
                disabled={busy || car === undefined}
                onClick={() => {
                  changeNumber(String(car));
                  input.current?.focus();
                }}
              >
                <span className="ref-bay-title">
                  {isStack
                    ? `PARKING SLOT #${slot + 1}`
                    : `SLOT ${String(slot + 1).padStart(2, "0")}`}
                </span>
                {isStack ? (
                  <span className="ref-bay-status">
                    {car === undefined
                      ? "AVAILABLE"
                      : end
                        ? "TOP OF STACK"
                        : "PARKED"}
                  </span>
                ) : (
                  end &&
                  car !== undefined && (
                    <span className="queue-next-out">
                      NEXT OUT
                    </span>
                  )
                )}
              </button>
            );
          })}
          {isStack && (
            <div
              className="ref-gate"
              style={{
                left: percent(STACK.gate[0], STACK.size[0]),
                top: percent(STACK.gate[1], STACK.size[1]),
              }}
            >
              <span
                className="ref-gate-icon"
                aria-hidden="true"
              >
                <span />
              </span>
              <span>SHARED ENTRANCE / EXIT</span>
            </div>
          )}
          {isStack && waiting.length > 0 && (
            <div
              className="ref-waiting"
              title={waiting.map((car) => `#${car}`).join(", ")}
            >
              TEMPORARY WAITING · {waiting.length}
            </div>
          )}
          {[...(sprites ?? parkedPoses())].map(([id, pose]) => (
            <Car
              key={id}
              id={id}
              pose={pose}
              size={board.size}
              moving={id === movingCar}
              isQueue={!isStack}
              isHeld={!isStack && waiting.includes(id)}
              register={(node) => {
                if (node) spritesById.current.set(id, node);
                else spritesById.current.delete(id);
              }}
            />
          ))}
        </div>
      </div>
      {isStack && (
        <div aria-hidden="true" className="ref-divider" />
      )}
      <div className="ref-controls">
        <div className="ref-monitor">
          <h2>PARKING MONITOR</h2>
          <form
            className="ref-form"
            onSubmit={(event) => {
              event.preventDefault();
              move("enter");
            }}
          >
            <label className="ref-monitor-row">
              <span>CAR NUMBER</span>
              <input
                ref={input}
                className="dsa-input"
                inputMode="numeric"
                autoComplete="off"
                value={number}
                readOnly={busy}
                onChange={(event) =>
                  changeNumber(event.target.value)
                }
              />
            </label>
            <div className="ref-monitor-row">
              <span>AVAILABLE SLOTS</span>
              <output aria-label="Available parking slots">
                <strong>{CAPACITY - cars.length}</strong>
                <span>/ {CAPACITY}</span>
              </output>
            </div>
            <div className="ref-actions">
              <Button
                type="submit"
                disabled={busy || cars.length === CAPACITY}
              >
                Enter Car
              </Button>
              <Button
                disabled={busy || !cars.length}
                onClick={() => move("exit")}
              >
                Exit Car
              </Button>
            </div>
            <Feedback notice={notice} fallback="" />
          </form>
        </div>
        <section className="ref-log" aria-label="Activity log">
          <h2>ACTIVITY LOG</h2>
          <ol ref={log} role="log" aria-relevant="additions">
            {events.map(({ event, detail }, index) => (
              <li key={index}>
                <strong>{event}</strong>
                <span>{detail}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

const parkingStyles = `
  @font-face {
    font-family: 'Parking Noto Serif Gujarati';
    src: url('https://static.figma.com/woff/v2/NotoSerifGujarati-VF_2/NotoSerifGujarati-VF_2.woff2') format('woff2');
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
  }
  @font-face {
    font-family: 'Parking Noto Sans';
    src: url('https://static.figma.com/woff/v2/NotoSans-VF_3/NotoSans-VF_3.woff2') format('woff2');
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
  }
  .dsa .reference-parking {
    --ref-heading-font: 'Parking Noto Serif Gujarati', 'Parking Noto Sans', system-ui, sans-serif;
    --ref-detail-font: 'Parking Noto Sans', system-ui, sans-serif;
    max-width: 1440px;
    margin-inline: auto;
  }
  .dsa .ref-stack { display: grid; grid-template-columns: minmax(0,571fr) clamp(18px,3.68vw,53px) 2px clamp(20px,6.87vw,99px) minmax(0,496fr); align-items: start; padding: 18px 8.89% 15px 6.32%; }
  .dsa .ref-queue { --queue-hold-fill: color-mix(in srgb,var(--accent) 10%,var(--paper)); padding: 25px 2.15% 14px; }
  .reference-parking .ref-lot { min-width: 0; background: var(--panel); }
  .reference-parking.ref-queue .ref-lot { background: transparent; }
  .reference-parking .ref-surface { position: relative; overflow: hidden; container-type: inline-size; height: 286px; }
  .ref-stack .ref-surface { height: 700px; }
  .reference-parking .queue-surface { height: auto; aspect-ratio: ${QUEUE_WIDTH} / ${QUEUE_HEIGHT}; }
  .ref-surface > * { position: absolute; }
  .ref-aisle { background: rgba(41,49,82,.045); }
  .ref-aisle::after { content: ''; position: absolute; pointer-events: none; --line: rgba(41,49,82,.43); }
  .ref-stack .ref-aisle::after { top: 9px; bottom: 25px; left: 50%; width: 2px; transform: translateX(-50%); background-image: linear-gradient(to bottom, transparent 8px, var(--line) 8px 24px, transparent 24px); background-size: 100% 34px; background-repeat: no-repeat space; }
  .ref-bay { border: 0; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.10); background: var(--navy); color: white; cursor: pointer; padding: 0; text-align: center; }
  .ref-bay:disabled { opacity: 1; cursor: default; }
  .ref-bay[data-selected='true'] { box-shadow: inset 0 0 0 2px var(--accent); }
  .ref-bay-title, .ref-bay-status { position: absolute; left: 3px; right: 3px; white-space: nowrap; }
  .ref-bay-title { top: 7px; font: 400 clamp(14px,1.58vw,23px)/1.15 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: .045em; }
  .ref-bay-status { bottom: 7px; font: 700 clamp(10px,1vw,14px)/1.1 'Noto Serif Gujarati',Arial,sans-serif; }
  .ref-gate, .ref-waiting { color: var(--navy); font: 400 15px/1 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: .045em; white-space: nowrap; }
  .ref-gate { display: flex; align-items: center; gap: 7px; font-size: 13px; pointer-events: none; }
  .ref-gate-icon { display: grid; place-items: center; width: 20px; height: 16px; flex: none; }
  .ref-gate-icon > span { position: relative; width: 16px; height: 1.5px; background: currentColor; }
  .ref-gate-icon > span::before, .ref-gate-icon > span::after { content: ''; position: absolute; top: 50%; width: 6px; height: 6px; border: solid currentColor; border-width: 1.5px 1.5px 0 0; }
  .ref-gate-icon > span::before { left: 0; transform: translateY(-50%) rotate(-135deg); }
  .ref-gate-icon > span::after { right: 0; transform: translateY(-50%) rotate(45deg); }
  .ref-stack .ref-gate { flex-direction: column; gap: 2px; transform: translate(-50%,-15px); }
  .ref-stack .ref-gate-icon { transform: rotate(90deg); }
  .ref-stack .ref-waiting { bottom: 7px; left: 4.4%; }
  .ref-queue .queue-map { inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
  .ref-queue .queue-lane-label { fill: var(--navy); font: 400 21px/1 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: .045em; }
  .ref-queue .ref-bay { background: transparent; box-shadow: none; }
  .ref-queue .ref-bay[data-selected='true'] { box-shadow: inset 0 0 0 2px #f1c278; }
  .ref-queue .ref-bay-title { top: 6%; left: 8%; right: auto; font-size: clamp(10px,1.34cqw,18px); }
  .ref-queue .queue-next-out { position: absolute; top: 6%; right: 8%; padding: .22em .5em; border-radius: 4px; background: #f2e7ca; color: #27282d; font: 400 clamp(8px,1.08cqw,15px)/1 'Bebas Neue','Arial Narrow',sans-serif; white-space: nowrap; }
  .ref-queue .queue-hold-heading { display: flex; align-items: center; justify-content: space-between; gap: 4px; white-space: nowrap; color: #35251e; }
  .ref-queue .queue-hold-heading h3 { display: flex; align-items: center; gap: .45em; font: 400 clamp(9px,1.28cqw,17px)/1 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: .045em; }
  .ref-queue .queue-hold-heading h3::before { content: ''; width: .24em; height: .8em; border-radius: 2px; background: var(--accent); }
  .ref-queue .queue-hold-heading > span { padding: .14em .5em; border-radius: 3px; background: var(--paper); box-shadow: inset 0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent); font: 600 clamp(8px,1cqw,14px)/1 var(--ref-detail-font); font-variant-numeric: tabular-nums; }
  .ref-queue .queue-hold-spaces { display: grid; grid-template-columns: repeat(${HOLDING.capacity},minmax(0,1fr)); padding: 0 2px 2px; }
  .ref-queue .queue-hold-spaces > span { min-width: 0; border: 1px solid color-mix(in srgb,var(--accent) 51%,var(--paper)); border-top: 0; }
  .ref-queue .queue-hold-spaces > span + span { border-left: 0; }
  .ref-car { --car-width: min(102px,7.1cqw); width: var(--car-width); aspect-ratio: 97.28 / 46.08; z-index: 2; transform: translate(-50%,-50%); pointer-events: none; }
  .ref-stack .ref-car { --car-width: min(102px,17cqw); }
  .ref-queue .ref-car { --car-width: 7.84cqw; }
  .ref-car.moving { z-index: 3; }
  .ref-car-art, .ref-plate { position: absolute; inset: 0; }
  .ref-car-art > span { position: absolute; }
  .ref-plate { display: grid; place-items: center; color: white; font: 700 calc(var(--car-width) * var(--plate-scale))/1 'Noto Serif Gujarati',Arial,sans-serif; font-variant-numeric: tabular-nums; }
  .ref-stack .ref-divider { grid-column: 3; align-self: stretch; margin: 35px 0; background: var(--accent); }
  .ref-stack .ref-controls { grid-column: 5; padding-top: 26px; }
  .ref-queue .ref-controls { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-items: start; margin: 18px 8.7% 0; gap: clamp(24px,7.56vw,109px); }
  .reference-parking .ref-monitor h2 { margin-bottom: 17px; text-align: center; font: 700 25px/1.25 var(--ref-heading-font); }
  .ref-form { display: grid; gap: 13px; }
  .ref-monitor-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(105px,52%); align-items: center; gap: 8px; min-height: 76px; padding: 12px 16px; border-radius: 15px; background: var(--dark); color: var(--paper); }
  .ref-monitor-row > span, .ref-log h2 { font: 700 clamp(15px,1.43vw,21px)/1.25 var(--ref-heading-font); white-space: nowrap; }
  .ref-monitor-row .dsa-input, .ref-monitor-row output { display: flex; align-items: center; height: 45px; min-width: 0; width: 100%; padding: 7px 12px; border: 0; border-radius: 13px; background: var(--panel); color: #111; font: 500 17px/1.25 var(--ref-detail-font); font-variant-numeric: tabular-nums; }
  .ref-monitor-row output { gap: 6px; }
  .ref-monitor-row output strong { font-size: 20px; font-weight: 700; }
  .ref-monitor-row output span { color: #4c4c4c; }
  .ref-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .ref-actions .dsa-button { min-width: 126px; }
  .reference-parking .dsa-feedback { margin: 0; min-height: 20px; font: 500 14px/1.4 var(--ref-detail-font); }
  .ref-stack .ref-log { margin-top: 19px; }
  .ref-log { display: grid; grid-template-columns: minmax(118px,39%) minmax(0,1fr); align-items: stretch; gap: 10px; height: 306px; padding: 16px; border-radius: 15px; background: var(--dark); color: var(--paper); }
  .ref-log ol { list-style: none; margin: 0; padding: 10px; overflow: auto; border-radius: 13px; background: var(--panel); color: #111; }
  .ref-log li { display: grid; grid-template-columns: 59px minmax(0,1fr); align-items: baseline; gap: 8px; padding-block: 6px; font: 500 13px/1.4 var(--ref-detail-font); }
  .ref-log li + li { border-top: 1px solid rgba(41,49,82,.12); }
  .ref-log li strong { padding: 3px; border-radius: 4px; background: rgba(41,49,82,.08); color: var(--navy); font: 700 10px/1.25 var(--ref-detail-font); text-align: center; text-transform: uppercase; white-space: nowrap; }
  .ref-log li span { overflow-wrap: anywhere; }
  @media (max-width: 900px) {
    .dsa .ref-stack, .ref-queue .ref-controls { display: flex; flex-direction: column; gap: 20px; padding-inline: 16px; margin-inline: 0; }
    .ref-stack .ref-controls { width: 100%; padding-top: 0; }
    .ref-stack .ref-lot, .ref-queue .ref-controls > * { width: 100%; }
    .ref-stack .ref-divider { display: none; }
  }
`;