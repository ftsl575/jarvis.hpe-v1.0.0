const fs = require("fs");
const report = {
  duplicate_rate: 0,
  null_rate: 0,
  parse_p95_time_ms: 0,
  generated_at: new Date().toISOString()
};
console.log(JSON.stringify(report, null, 2));
