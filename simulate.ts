const { randomInt } = await import("node:crypto");

import {
  布大王,
  卡卡罗,
  尤诺,
  奥古斯塔,
  弗洛洛,
  今汐,
  长离,
} from "./dangos.js";

const TILES = 30;
const MAX_DICE_POINTS = 3;
const MIN_DICE_POINTS = 1;
const SIMULATION_COUNT = 20000;
const RACE_DANGOS = [布大王, 卡卡罗, 尤诺, 奥古斯塔, 弗洛洛, 今汐, 长离];

export type TileType = "normal" | "advance" | "retreat" | "shuffle";

export interface RaceTile {
  type: TileType;
  stack: Dango[];
}

export interface TileSettlement {
  dango: Dango;
  progress: number;
  tileIndex: number;
  tileType: TileType;
  skipped: boolean;
}

type InitialTileSetup = Partial<Record<number | "start" | "finish", string[]>>;

export interface MoveOptions {
  placement?: "top" | "bottom";
  insert?: number;
}

export interface DangoState {
  progress: number;
  tileIndex: number;
  dicePoints: number;
  movePoints: number;
  skipTileSettlement?: boolean;
}

export type WalkMoveHandler = (tileIndex: number, movingStack: Dango[]) => void;
export type AfterShuffeCallback = (this: RaceContext, dangos: Dango[]) => void;

export class RaceContext {
  tiles = createTiles(TILES);
  dangoStates = {} as Record<string, DangoState>;
  moveIndex = 0;
  finishProgress = TILES + 1;
  afterShuffeCallbacks: AfterShuffeCallback[] = [];
  roundIndex = 0;

  rollDice() {
    return randomInt(MIN_DICE_POINTS, MAX_DICE_POINTS + 1);
  }

  registerAfterShuffeCallback(callback: AfterShuffeCallback) {
    this.afterShuffeCallbacks.push(callback);
  }

  participate(dango: Dango) {
    const initialProgress = dango.initialStep?.(this);
    const progress = initialProgress ?? 0;
    this.dangoStates[dango.name]! = {
      progress,
      tileIndex: this.tileIndexForProgress(progress),
      dicePoints: NaN,
      movePoints: NaN,
    };

    const state = this.dangoStates[dango.name]!;
    this.landDangosAt(state.progress, [dango], { placement: "bottom" });
  }

  tileOf(dango: Dango) {
    const state = this.dangoStates[dango.name]!;
    return this.tileAt(state.tileIndex);
  }

  stateOf<TState extends DangoState>(dango: Dango<TState>) {
    return this.dangoStates[dango.name] as TState;
  }

  tileAt(tileIndex: number) {
    return this.tiles[this.normalizeTileIndex(tileIndex)]!;
  }

  /** @internal */
  tileIndexForProgress(progress: number) {
    if (progress >= this.finishProgress) {
      return this.finishProgress;
    }

    return this.normalizeTileIndex(progress);
  }

  private normalizeTileIndex(tileIndex: number) {
    const ringSize = this.finishProgress + 1;
    return ((tileIndex % ringSize) + ringSize) % ringSize;
  }

  moveStackBy(dango: Dango, delta: number, options: MoveOptions = {}) {
    const state = this.dangoStates[dango.name]!;
    this.moveStackTo(dango, state.progress + delta, options);
  }

  moveAloneBy(dango: Dango, delta: number, options: MoveOptions = {}) {
    const state = this.dangoStates[dango.name]!;
    this.moveAloneTo(dango, state.progress + delta, options);
  }

  moveStackTo(dango: Dango, progress: number, options: MoveOptions = {}) {
    const currentStack = this.tileOf(dango).stack;
    const index = currentStack.indexOf(dango);
    const movingDangos = index >= 0 ? currentStack.splice(index) : [dango];
    this.landDangosAt(progress, movingDangos, options);
  }

  moveAloneTo(dango: Dango, progress: number, options: MoveOptions = {}) {
    const currentStack = this.tileOf(dango).stack;
    const index = currentStack.indexOf(dango);
    if (index >= 0) {
      currentStack.splice(index, 1);
    }

    this.landDangosAt(progress, [dango], options);
  }

  walkTo(dango: Dango, targetProgress: number, handleTile: WalkMoveHandler) {
    const currentStack = this.tileOf(dango).stack;
    const index = currentStack.indexOf(dango);
    if (index < 0) {
      return;
    }

    const movingStack = currentStack.slice(index);
    const startProgress = this.stateOf(dango).progress;
    const clampedTargetProgress = Math.min(targetProgress, this.finishProgress);
    const delta = clampedTargetProgress >= startProgress ? 1 : -1;
    let progress = startProgress;

    while (true) {
      const tileIndex = this.tileIndexForProgress(progress);
      handleTile(tileIndex, movingStack);

      if (progress === clampedTargetProgress) {
        break;
      }

      const currentStack = this.tileAt(tileIndex).stack;
      for (const dango of movingStack) {
        const index = currentStack.indexOf(dango);
        if (index >= 0) {
          currentStack.splice(index, 1);
        }
      }

      progress += delta;
      const nextTileIndex = this.tileIndexForProgress(progress);
      const nextStack = this.tileAt(nextTileIndex).stack;
      const shouldTriggerStackingEvents =
        nextTileIndex > 0 &&
        nextTileIndex < this.finishProgress &&
        progress < this.finishProgress &&
        nextStack.length > 0;
      const beingStackedDangos = shouldTriggerStackingEvents
        ? [...nextStack]
        : [];

      nextStack.push(...movingStack);

      for (const dango of beingStackedDangos) {
        dango.onBeingStacked?.(this, this.dangoStates[dango.name]!);
      }

      for (const dango of movingStack) {
        this.dangoStates[dango.name]!.progress = progress;
        this.dangoStates[dango.name]!.tileIndex = nextTileIndex;
      }
    }
  }

  private landDangosAt(
    progress: number,
    dangos: Dango[],
    options: MoveOptions = {},
    triggerStackingEvents = true,
  ) {
    const targetProgress = Math.min(progress, this.finishProgress);
    const targetTileIndex = this.tileIndexForProgress(targetProgress);
    const stack = this.tileAt(targetTileIndex).stack;
    const insertIndex =
      options.insert === undefined
        ? options.placement === "bottom"
          ? 0
          : stack.length
        : Math.max(0, Math.min(Math.trunc(options.insert), stack.length));

    for (const d of dangos) {
      this.dangoStates[d.name]!.progress = targetProgress;
      this.dangoStates[d.name]!.tileIndex = targetTileIndex;
    }

    const shouldTriggerStackingEvents =
      triggerStackingEvents &&
      targetTileIndex > 0 &&
      targetTileIndex < this.finishProgress &&
      targetProgress < this.finishProgress &&
      insertIndex > 0;
    const beingStackedDangos = shouldTriggerStackingEvents
      ? stack.slice(0, insertIndex)
      : [];

    stack.splice(insertIndex, 0, ...dangos);

    for (const d of beingStackedDangos) {
      d.onBeingStacked?.(this, this.dangoStates[d.name]!);
    }
  }

  settleTile(dango: Dango) {
    const state = this.dangoStates[dango.name]!;
    if (
      state.tileIndex === 0 ||
      state.tileIndex === this.finishProgress ||
      state.progress >= this.finishProgress
    ) {
      return;
    }

    const settlement: TileSettlement = {
      dango,
      progress: state.progress,
      tileIndex: state.tileIndex,
      tileType: this.tiles[state.tileIndex]!.type,
      skipped: false,
    };
    const settlementDangos = [...this.tileOf(dango).stack];

    for (const settlementDango of settlementDangos) {
      settlementDango.beforeTileSettlement?.(
        this,
        this.dangoStates[settlementDango.name]!,
        settlement,
      );
    }

    if (!settlement.skipped) {
      switch (settlement.tileType) {
        case "advance":
          this.moveStackBy(dango, 1);
          break;
        case "retreat":
          this.moveStackBy(dango, -1);
          break;
        case "shuffle":
          shuffle(this.tileOf(dango).stack);
          break;
        case "normal":
          break;
      }
    }

    for (const settlementDango of settlementDangos) {
      settlementDango.afterTileSettlement?.(
        this,
        this.dangoStates[settlementDango.name]!,
        settlement,
      );
    }
  }

  defaultMove(dango: Dango) {
    const state = this.dangoStates[dango.name]!;
    this.moveStackBy(dango, state.movePoints);
  }

  move(dango: Dango) {
    const state = this.dangoStates[dango.name]!;
    state.skipTileSettlement = false;

    dango.onMoveStart?.(this, state);

    if (dango.move) {
      dango.move(this, state);
    } else {
      this.defaultMove(dango);
    }

    if (!state.skipTileSettlement) {
      this.settleTile(dango);
    }
    state.skipTileSettlement = false;
    dango.onMoveEnd?.(this, state);
    this.moveIndex++;
  }
}

export interface Dango<TState extends DangoState = DangoState> {
  name: string;
  onMoveStart?(context: RaceContext, state: TState): void;
  move?(context: RaceContext, state: TState): void;
  rollDice?(context: RaceContext, state: TState): number;
  initialStep?(context: RaceContext): number;
  activeFromRound?: number;
  canWin?: boolean;
  beforeTileSettlement?(
    context: RaceContext,
    state: TState,
    settlement: TileSettlement,
  ): void;
  afterTileSettlement?(
    context: RaceContext,
    state: TState,
    settlement: TileSettlement,
  ): void;
  onMoveEnd?(context: RaceContext, state: TState): void;
  onBeingStacked?(context: RaceContext, state: TState): void;
  onRoundEnd?(context: RaceContext, state: TState): void;
}

function createTiles(tileCount: number) {
  const tiles = Array.from(
    { length: tileCount + 2 },
    (): RaceTile => ({
      type: "normal",
      stack: [],
    }),
  );

  for (const tileIndex of [2, 10, 15, 22]) {
    tiles[tileIndex]!.type = "advance";
  }
  for (const tileIndex of [9, 27]) {
    tiles[tileIndex]!.type = "retreat";
  }
  for (const tileIndex of [5, 19, 30]) {
    tiles[tileIndex]!.type = "shuffle";
  }

  return tiles;
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    // 生成一个 0 到 i（含）之间的随机索引
    const j = randomInt(0, i + 1);
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}

const RaceManager = {
  dangos: [] as Dango[],
  context: new RaceContext(),
  initialTileSetup: undefined as InitialTileSetup | undefined,
  initialMoveOrder: undefined as string[] | undefined,

  start() {
    let finish = false;

    this.context = new RaceContext();

    this.dangos.forEach((dango) => {
      this.context.participate(dango);
    });

    this.applyInitialTileSetup();

    while (!finish) {
      this.context.roundIndex++;
      // round start
      if (this.initialMoveOrder && this.context.roundIndex === 1) {
        this.sortDangosByInitialMoveOrder();
      } else {
        shuffle(this.dangos);
      }
      const afterShuffeCallbacks = this.context.afterShuffeCallbacks;
      this.context.afterShuffeCallbacks = [];
      for (const callback of afterShuffeCallbacks) {
        callback.call(this.context, this.dangos);
      }
      this.context.moveIndex = 0;

      const activeDangos = this.dangos.filter((dango) => {
        return (
          !dango.activeFromRound ||
          dango.activeFromRound <= this.context.roundIndex
        );
      });

      if (!this.initialTileSetup && this.context.roundIndex === 1) {
        this.applyDefaultStartSetup(activeDangos);
      }

      for (const dango of activeDangos) {
        const state = this.context.stateOf(dango);
        const dicePoints = dango.rollDice
          ? dango.rollDice(this.context, state)
          : this.context.rollDice();
        state.dicePoints = dicePoints;
        state.movePoints = dicePoints;
      }

      for (const dango of activeDangos) {
        this.context.move(dango);
        if (
          dango.canWin !== false &&
          this.context.dangoStates[dango.name]!.progress >=
            this.context.finishProgress
        ) {
          finish = true;
          break;
        }
      }

      for (const dango of this.dangos) {
        dango.onRoundEnd?.(this.context, this.context.stateOf(dango));
      }
    }

    // 结算
    const winner = this.context
      .tileAt(this.context.finishProgress)
      .stack.findLast((dango) => {
        return (
          dango.canWin !== false &&
          this.context.dangoStates[dango.name]!.progress >=
            this.context.finishProgress
        );
      })!;
    this.result[winner.name]!++;
  },

  register(dango: Dango) {
    this.dangos.push(dango);
    if (dango.canWin !== false) {
      this.result[dango.name] = 0;
    }
  },

  setInitialTileSetup(setup: InitialTileSetup) {
    this.initialTileSetup = setup;
  },

  setInitialMoveOrder(names: string[]) {
    this.initialMoveOrder = names;
  },

  applyInitialTileSetup() {
    if (!this.initialTileSetup) {
      return;
    }

    for (const [stepText, names] of Object.entries(this.initialTileSetup)) {
      if (!names) {
        continue;
      }

      const progress = this.parseInitialProgress(stepText);
      for (const name of names) {
        const dango = this.dangos.find((dango) => dango.name === name);
        if (!dango) {
          throw new Error(`Unknown dango in initial setup: ${name}`);
        }

        this.placeDangoAt(dango, progress);
      }
    }
  },

  applyDefaultStartSetup(activeDangos: Dango[]) {
    for (const dango of activeDangos.toReversed()) {
      if (this.context.stateOf(dango).progress === 0) {
        this.placeDangoAt(dango, 0);
      }
    }
  },

  placeDangoAt(dango: Dango, progress: number) {
    const state = this.context.stateOf(dango);
    const stack = this.context.tileOf(dango).stack;
    const index = stack.indexOf(dango);
    if (index >= 0) {
      stack.splice(index, 1);
    }

    state.progress = Math.min(progress, this.context.finishProgress);
    state.tileIndex = this.context.tileIndexForProgress(state.progress);
    this.context.tileAt(state.tileIndex).stack.push(dango);
  },

  sortDangosByInitialMoveOrder() {
    const order = new Map(
      this.initialMoveOrder!.map((name, index) => [name, index]),
    );
    this.dangos.sort((a, b) => {
      return (
        (order.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.name) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  },

  parseInitialProgress(stepText: string) {
    if (stepText === "start") {
      return 0;
    }
    if (stepText === "finish") {
      return this.context.finishProgress;
    }

    return Number(stepText);
  },

  result: {} as Record<string, number>,
};

for (const dango of RACE_DANGOS) {
  RaceManager.register(dango);
}

RaceManager.setInitialTileSetup({
  "-1": ["珂莱塔"],
  "-2": ["琳奈", "千咲"],
  "-3": ["爱弥斯", "莫宁"],
  "-4": ["守岸人"],
});

for (let i = 0; i < SIMULATION_COUNT; i++) {
  RaceManager.start();
}

for (const [name, wins] of Object.entries(RaceManager.result)) {
  console.log(`${name}团子获胜: ${wins}次`);
}
