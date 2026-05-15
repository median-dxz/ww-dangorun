import { RaceManager } from "./RaceManager.js";
import { 布大王, 弗洛洛, 琳奈, 莫宁, 菲比, 长离, 陆·赫斯 } from "./dangos.js";

RaceManager.register(布大王, 琳奈, 莫宁, 陆·赫斯, 菲比, 弗洛洛, 长离);

const SIMULATION_COUNT = 20000;

for (let i = 0; i < SIMULATION_COUNT; i++) {
    RaceManager.start();
}

for (const [name, result] of Object.entries(RaceManager.result)) {
    console.log(
        `${name}团子获胜: ${result.wins}次，` +
            `获胜回合统计: 众数: ${mode(result.winningRounds)}, 平均数: ${average(result.winningRounds).toFixed(2)}`,
    );
}

function mode(roundCounts: Map<number, number>) {
    let modeValue = NaN;
    let modeCount = 0;

    for (const [round, count] of roundCounts) {
        if (count > modeCount) {
            modeValue = round;
            modeCount = count;
        }
    }

    return modeValue;
}

function average(roundCounts: Map<number, number>) {
    let totalRounds = 0;
    let totalWins = 0;

    for (const [round, count] of roundCounts) {
        totalRounds += round * count;
        totalWins += count;
    }

    return totalRounds / totalWins;
}
