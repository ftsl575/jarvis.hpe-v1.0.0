const { buildCompatibilityMap } = require("../../src/compatibility/compatibility");

test("buildCompatibilityMap normalizes and maps correctly", () => {
  const parts = [
    { partNumber: "A123", replacedBy: "B234", substitute: "C345" },
    { partNumber: "B234" },
  ];
  const map = buildCompatibilityMap(parts);
  expect(map.A123.replacedBy).toBe("B234");
  expect(map.A123.substitute).toBe("C345");
  expect(map.B234.replacedBy).toBeNull();
  expect(map.B234.substitute).toBeNull();
});
