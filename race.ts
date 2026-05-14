const { randomInt } = await import("node:crypto");

const TILES = 30;
const MAX_DICE_POINTS = 3;
const MIN_DICE_POINTS = 1;

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

export type InitialTileSetup = Partial<Record<number | "start" | "finish", string[]>>;

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
    private triggerStackingEvents = false;

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

    moveAloneBy(
        dango: Dango,
        delta: number,
        options: MoveOptions = {},
        triggerStackingEvents = false,
    ) {
        const state = this.dangoStates[dango.name]!;
        this.moveAloneTo(dango, state.progress + delta, options, triggerStackingEvents);
    }

    moveStackTo(dango: Dango, progress: number, options: MoveOptions = {}) {
        const currentStack = this.tileOf(dango).stack;
        const index = currentStack.indexOf(dango);
        const movingDangos = index >= 0 ? currentStack.splice(index) : [dango];
        this.landDangosAt(progress, movingDangos, options, this.triggerStackingEvents);
    }

    moveAloneTo(
        dango: Dango,
        progress: number,
        options: MoveOptions = {},
        triggerStackingEvents = false,
    ) {
        const currentStack = this.tileOf(dango).stack;
        const index = currentStack.indexOf(dango);
        if (index >= 0) {
            currentStack.splice(index, 1);
        }

        this.landDangosAt(progress, [dango], options, triggerStackingEvents);
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
                this.triggerStackingEvents &&
                nextTileIndex > 0 &&
                nextTileIndex < this.finishProgress &&
                progress < this.finishProgress &&
                nextStack.length > 0;
            const beingStackedDangos = shouldTriggerStackingEvents ? [...nextStack] : [];

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
        triggerStackingEvents = false,
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
        const beingStackedDangos = shouldTriggerStackingEvents ? stack.slice(0, insertIndex) : [];

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

        this.triggerStackingEvents = true;
        try {
            if (dango.move) {
                dango.move(this, state);
            } else {
                this.defaultMove(dango);
            }

            if (!state.skipTileSettlement) {
                this.settleTile(dango);
            }
        } finally {
            this.triggerStackingEvents = false;
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
    beforeTileSettlement?(context: RaceContext, state: TState, settlement: TileSettlement): void;
    afterTileSettlement?(context: RaceContext, state: TState, settlement: TileSettlement): void;
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

export function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [array[i], array[j]] = [array[j]!, array[i]!];
    }
    return array;
}
