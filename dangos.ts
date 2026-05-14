const { randomInt } = await import("node:crypto");

import type { Dango, DangoState, RaceContext } from "./race.js";

const MAX_DICE_POINTS = 3;

type LastDiceState = DangoState & {
    lastDicePoints?: number;
};

type MetBudawangState = DangoState & {
    metBudawang?: boolean;
};

type NextRoundState = DangoState & {
    nextRoundFlag?: boolean;
};

function chance(percent: number) {
    return randomInt(1, 101) <= percent;
}

function racingRank(context: RaceContext) {
    return context.tiles
        .flatMap((tile) => tile.stack)
        .filter((dango) => dango.canWin !== false)
        .filter((dango) => context.stateOf(dango).progress < context.finishProgress)
        .sort((a, b) => {
            const aState = context.stateOf(a);
            const bState = context.stateOf(b);
            if (aState.progress !== bState.progress) {
                return bState.progress - aState.progress;
            }

            return context.tileOf(b).stack.indexOf(b) - context.tileOf(a).stack.indexOf(a);
        });
}

export const 洛可可: Dango = {
    name: "洛可可",
    onMoveStart(context, state) {
        if (context.moveIndex === Object.entries(context.dangoStates).length - 1) {
            state.movePoints += 2;
        }
    },
};

export const 布兰特: Dango = {
    name: "布兰特",
    onMoveStart(context, state) {
        if (context.moveIndex === 0) {
            state.movePoints += 2;
        }
    },
};

export const 陆·赫斯: Dango = {
    name: "陆·赫斯",
    afterTileSettlement(context, _state, settlement) {
        if (settlement.dango !== this) {
            return;
        }

        if (settlement.tileType === "advance") {
            context.moveStackBy(this, 3);
        } else if (settlement.tileType === "retreat") {
            context.moveStackBy(this, -1);
        }
    },
};

export const 西格莉卡: Dango = {
    name: "西格莉卡",
    onMoveStart(context, state) {
        const selfStack = context.tileOf(this).stack;
        const selfHeight = selfStack.indexOf(this);
        const targets: Dango[] = [];

        for (const tileIndex of [state.tileIndex - 1, state.tileIndex, state.tileIndex + 1]) {
            const stack = context.tileAt(tileIndex).stack;
            for (let height = stack.length - 1; height > selfHeight; height--) {
                const target = stack[height]!;
                if (target !== this && target.canWin !== false) {
                    targets.push(target);
                }
            }
        }

        for (const target of targets.slice(0, 2)) {
            const targetState = context.stateOf(target);
            targetState.movePoints = Math.max(1, targetState.movePoints - 1);
        }
    },
};

export const 达妮娅: Dango<LastDiceState> = {
    name: "达妮娅",
    onMoveStart(_context, state) {
        const dicePoints = state.dicePoints;

        if (state.lastDicePoints === dicePoints) {
            state.movePoints += 2;
        }

        state.lastDicePoints = dicePoints;
    },
};

export const 绯雪: Dango<MetBudawangState> = {
    name: "绯雪",
    onMoveStart(_context, state) {
        if (state.metBudawang) {
            state.movePoints += 2;
        }
    },
    onMoveEnd(context, state) {
        if (state.progress === 0) {
            return;
        }

        if (context.tileOf(this).stack.some((dango) => dango.name === "布大王")) {
            state.metBudawang = true;
        }
    },
    onBeingStacked(context, state) {
        if (
            state.progress !== 0 &&
            context.tileOf(this).stack.some((dango) => dango.name === "布大王")
        ) {
            state.metBudawang = true;
        }
    },
};

export const 布大王: Dango<NextRoundState> = {
    name: "布大王",
    activeFromRound: 3,
    canWin: false,
    initialStep(context) {
        return context.finishProgress;
    },
    rollDice() {
        return randomInt(1, 7);
    },
    move(context, state) {
        const lastDango = racingRank(context).at(-1);
        const lastTileProgress = lastDango ? context.stateOf(lastDango).progress : undefined;
        const currentProgress = state.progress;

        context.walkTo(this, state.progress - state.movePoints, (tileIndex, movingStack) => {
            const stack = context.tileAt(tileIndex).stack;

            stack.splice(stack.indexOf(this), 1);
            stack.unshift(this);
            movingStack.splice(0, movingStack.length, ...stack);

            for (const dango of stack) {
                if (dango.name === "绯雪") {
                    context.stateOf(绯雪).metBudawang = true;
                }
            }
        });

        if (
            lastTileProgress !== undefined &&
            currentProgress > lastTileProgress &&
            state.progress < lastTileProgress
        ) {
            state.nextRoundFlag = true;
        }
    },
    onMoveEnd(context) {
        for (const dango of context.tileOf(this).stack) {
            if (dango.name === "绯雪") {
                context.stateOf(绯雪).metBudawang = true;
            }
        }
    },
    onRoundEnd(context, state) {
        if (!state.nextRoundFlag) {
            return;
        }

        state.nextRoundFlag = false;
        context.moveAloneTo(this, context.finishProgress, { placement: "bottom" });
    },
};

export const 坎特蕾拉: Dango<NextRoundState> = {
    name: "坎特蕾拉",
    move(context, state) {
        if (!state.nextRoundFlag) {
            context.defaultMove(this);
            return;
        }

        const target = Math.min(state.progress + state.movePoints, context.finishProgress - 1);
        context.walkTo(this, target, (tileIndex, movingStack) => {
            const curStack = context.tileAt(tileIndex).stack;
            if (curStack.length > 0 && !state.nextRoundFlag) {
                state.nextRoundFlag = true;
                const pickedDangos = curStack.splice(0);
                movingStack.unshift(...pickedDangos);
            }
        });
    },
};

export const 赞妮: Dango<NextRoundState> = {
    name: "赞妮",
    rollDice() {
        return [1, 3][randomInt(0, 2)]!;
    },
    onMoveStart(context, state) {
        if (state.nextRoundFlag && chance(40)) {
            state.movePoints += 2;
        }

        state.nextRoundFlag = context.tileOf(this).stack.length > 1;
    },
};

export const 卡提希娅: Dango<NextRoundState> = {
    name: "卡提希娅",
    onMoveStart(_context, state) {
        if (state.nextRoundFlag && chance(60)) {
            state.movePoints += 2;
        }
    },
    onMoveEnd(context, state) {
        const lastDango = racingRank(context).at(-1);
        if (lastDango && context.tileOf(lastDango).stack[0] === this) {
            state.nextRoundFlag = true;
        }
    },
};

export const 菲比: Dango = {
    name: "菲比",
    onMoveStart(_context, state) {
        if (chance(50)) {
            state.movePoints += 1;
        }
    },
};

export const 今汐: Dango = {
    name: "今汐",
    onBeingStacked(context) {
        const stack = context.tileOf(this).stack;
        if (stack.indexOf(this) !== stack.length - 1 && chance(40)) {
            const index = stack.indexOf(this);
            stack.splice(index, 1);
            stack.push(this);
        }
    },
};

export const 长离: Dango = {
    name: "长离",
    onMoveEnd(context) {
        const stack = context.tileOf(this).stack;
        if (stack.indexOf(this) > 0 && chance(65)) {
            const self = this;
            context.registerAfterShuffeCallback(function (dangos) {
                const index = dangos.indexOf(self);
                dangos.splice(index, 1);
                dangos.push(self);
            });
        }
    },
};

export const 卡卡罗: Dango = {
    name: "卡卡罗",
    onMoveStart(context, state) {
        if (state.progress === 0) {
            return;
        }
        const lastDango = racingRank(context).at(-1);

        if (lastDango && context.tileOf(lastDango).stack[0] === this) {
            state.movePoints += 3;
        }
    },
};

export const 守岸人: Dango = {
    name: "守岸人",
    rollDice() {
        return randomInt(2, MAX_DICE_POINTS + 1);
    },
};

export const 椿: Dango = {
    name: "椿",
    move(context, state) {
        if (!chance(50)) {
            context.defaultMove(this);
            return;
        }

        const currentStack = context.tileOf(this).stack;
        const extraPoints = currentStack.length - 1;
        context.moveAloneBy(this, state.movePoints + extraPoints);
    },
};

export const 珂莱塔: Dango = {
    name: "珂莱塔",
    onMoveStart(_context, state) {
        if (chance(28)) {
            state.movePoints *= 2;
        }
    },
};

export const 千咲: Dango = {
    name: "千咲",
    onMoveStart(context, state) {
        let minDice = true;
        for (const [name, dangoState] of Object.entries(context.dangoStates)) {
            if (name !== "千咲" && dangoState.dicePoints < state.dicePoints) {
                minDice = false;
                break;
            }
        }
        if (minDice) {
            state.movePoints += 2;
        }
    },
};

export const 琳奈: Dango = {
    name: "琳奈",
    move(context) {
        if (!chance(20)) {
            context.defaultMove(this);
        }
    },
    onMoveStart(_context, state) {
        if (chance(60)) {
            state.movePoints *= 2;
        }
    },
};

export const 莫宁: Dango<LastDiceState> = {
    name: "莫宁",
    rollDice(_context, state) {
        const lastDicePoints = state.lastDicePoints ?? 1;
        const dicePoints = ((lastDicePoints - 2 + MAX_DICE_POINTS) % MAX_DICE_POINTS) + 1;
        state.lastDicePoints = dicePoints;
        return dicePoints;
    },
};

export const 爱弥斯: Dango<NextRoundState> = {
    name: "爱弥斯",
    onMoveEnd(context, state) {
        const mid = context.tiles.length / 2;
        if (state.nextRoundFlag == null && state.progress >= mid) {
            let minDistance = context.tiles.length + 2;
            let targetProgress: number | null = null;
            for (const { stack } of context.tiles) {
                for (const dango of stack) {
                    const dangoState = context.stateOf(dango);
                    if (
                        dango.name !== "布大王" &&
                        dangoState.progress > state.progress &&
                        dangoState.progress - state.progress < minDistance
                    ) {
                        targetProgress = dangoState.progress;
                        minDistance = dangoState.progress - state.progress;
                    }
                }
            }

            state.nextRoundFlag = true;
            if (targetProgress !== null) {
                context.moveAloneTo(this, targetProgress);
            }
        }
    },
};

export const 奥古斯塔: Dango<NextRoundState> = {
    name: "奥古斯塔",
    onMoveStart(context, state) {
        const stack = context.tileOf(this).stack;
        const isOnTop = stack.length > 1 && stack.at(-1) === this;
        state.nextRoundFlag = isOnTop;

        if (!isOnTop) {
            return;
        }

        const self = this;
        context.registerAfterShuffeCallback(function (dangos) {
            const index = dangos.indexOf(self);
            if (index >= 0) {
                dangos.splice(index, 1);
                dangos.push(self);
            }
        });
    },
    move(context, state) {
        if (state.nextRoundFlag) {
            state.skipTileSettlement = true;
            return;
        }

        context.defaultMove(this);
    },
};

export const 尤诺: Dango<NextRoundState> = {
    name: "尤诺",
    onMoveEnd(context, state) {
        const midpoint = context.tiles.length / 2;
        if (state.nextRoundFlag != null || state.progress < midpoint) {
            return;
        }

        state.nextRoundFlag = true;
        const ranks = racingRank(context);
        for (const d of ranks) {
            if (d.name !== "布大王") {
                context.moveAloneTo(d, state.progress, { placement: "bottom" }, false);
            }
        }
    },
};

export const 弗洛洛: Dango = {
    name: "弗洛洛",
    onMoveStart(context, state) {
        const stack = context.tileOf(this).stack;
        if (stack.length > 1 && stack[0] === this) {
            state.movePoints += 3;
        }
    },
};

export const allDangos: Dango[] = [
    洛可可,
    布兰特,
    陆·赫斯,
    西格莉卡,
    达妮娅,
    绯雪,
    布大王,
    坎特蕾拉,
    赞妮,
    卡提希娅,
    菲比,
    今汐,
    长离,
    卡卡罗,
    守岸人,
    椿,
    珂莱塔,
    奥古斯塔,
    尤诺,
    弗洛洛,
];
