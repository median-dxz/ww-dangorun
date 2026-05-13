# WW-Dangorun

一个用 TypeScript 编写的鸣潮小团快跑模拟器（ver2026!）。

## 今日赛程预测 (2026-05-13)

## 环境要求

- Node.js >= 24
- pnpm 11.x

## 安装依赖

```bash
pnpm install
```

## 运行模拟

```bash
pnpm exec tsx simulate.ts
```

## 项目结构

```text
.
├── dangos.ts          # 团子定义与各自的特殊规则
├── simulate.ts        # 赛道、比赛流程和模拟入口
```

## 修改模拟配置

配置位于 `simulate.ts`。团子的能力定义位于 `dangos.ts`，新增团子时实现 `Dango` 接口，并在模拟入口注册即可。

### 1. 团子列表

修改 `simulate.ts` 底部的 `RACE_DANGOS`：

```ts
const RACE_DANGOS = [守岸人, 珂莱塔, 布大王, 千咲, 莫宁, 琳奈, 爱弥斯];
```

数组里的团子会依次调用 `RaceManager.register(dango)` 注册。

### 2. 团子初始顺序和初始摆放

第一轮行动顺序默认会随机洗牌。如果需要固定第一轮行动顺序，调用：

```ts
RaceManager.setInitialMoveOrder(["守岸人", "珂莱塔", "布大王"]);
```

没有写进数组的团子会排在已指定团子后面，并保留它们当前的相对顺序。

初始摆放通过 `RaceManager.setInitialTileSetup(...)` 设置：

```ts
RaceManager.setInitialTileSetup({
  "-1": ["珂莱塔"],
  "-2": ["琳奈", "千咲"],
  "-3": ["爱弥斯", "莫宁"],
  "-4": ["守岸人"],
});
```

键是初始进度，可以写数字字符串，也可以写 `"start"` 或 `"finish"`。值是该格上的团子名数组；同一格内按从左到右、从底到顶的顺序摆放，所以上例中 `"-2"` 的 `千咲` 会在 `琳奈` 上方。设置初始摆放后，会覆盖团子通过 `initialStep` 得到的位置。

如果不调用 `setInitialTileSetup`，第一轮开始时会把进度为 0 的活跃团子放到起点，并按第一轮行动顺序形成起点堆叠。

### 3. 模拟次数

修改 `simulate.ts` 顶部的 `SIMULATION_COUNT`：

```ts
const SIMULATION_COUNT = 20000;
```

次数越大，结果越稳定，运行时间也越长。

### 4. 棋盘大小和棋盘格子设置

棋盘基础参数在 `simulate.ts` 顶部：

```ts
const TILES = 30;
const MAX_DICE_POINTS = 3;
const MIN_DICE_POINTS = 1;
```

`TILES` 是普通赛道格数量。起点进度是 `0`，终点进度是 `TILES + 1`。骰子点数在 `MIN_DICE_POINTS` 到 `MAX_DICE_POINTS` 之间闭区间随机。

特殊格子在 `createTiles(tileCount)` 中设置：

```ts
for (const tileIndex of [2, 10, 15, 22]) {
  tiles[tileIndex]!.type = "advance";
}
for (const tileIndex of [9, 27]) {
  tiles[tileIndex]!.type = "retreat";
}
for (const tileIndex of [5, 19, 30]) {
  tiles[tileIndex]!.type = "shuffle";
}
```

格子类型包括：

- `normal`：普通格。
- `advance`：结算时整叠前进 1 格。
- `retreat`：结算时整叠后退 1 格。
- `shuffle`：结算时打乱当前格的堆叠顺序。
