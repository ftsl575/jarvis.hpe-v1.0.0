const { performance } = require("perf_hooks");
const t0 = performance.now();
// TODO: подставить реальный вызов парсера/репозитория
for (let i=0;i<5e6;i++){} // холостой прогон
const t1 = performance.now();
console.log(`bench:parse ok, elapsed_ms=${(t1-t0).toFixed(2)}`);
