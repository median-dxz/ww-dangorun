import { RaceManager } from "./RaceManager.js";
import { 布大王, 卡卡罗, 尤诺, 奥古斯塔, 弗洛洛, 今汐, 长离 } from "./dangos.js";

RaceManager.register(布大王, 卡卡罗, 尤诺, 奥古斯塔, 弗洛洛, 今汐, 长离);

const SIMULATION_COUNT = 20000;

for (let i = 0; i < SIMULATION_COUNT; i++) {
    RaceManager.start();
}

for (const [name, wins] of Object.entries(RaceManager.result)) {
    console.log(`${name}团子获胜: ${wins}次`);
}
