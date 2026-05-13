import { type Dango, type InitialTileSetup, RaceContext, shuffle } from "./race.js";

export const RaceManager = {
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
                return !dango.activeFromRound || dango.activeFromRound <= this.context.roundIndex;
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
                    this.context.dangoStates[dango.name]!.progress >= this.context.finishProgress
                ) {
                    finish = true;
                    break;
                }
            }

            for (const dango of this.dangos) {
                dango.onRoundEnd?.(this.context, this.context.stateOf(dango));
            }
        }

        const winner = this.context.tileAt(this.context.finishProgress).stack.findLast((dango) => {
            return (
                dango.canWin !== false &&
                this.context.dangoStates[dango.name]!.progress >= this.context.finishProgress
            );
        })!;
        this.result[winner.name]!++;
    },

    register(...dangos: Dango[]) {
        for (const dango of dangos) {
            this.dangos.push(dango);
            if (dango.canWin !== false) {
                this.result[dango.name] = 0;
            }
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
        const order = new Map(this.initialMoveOrder!.map((name, index) => [name, index]));
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
