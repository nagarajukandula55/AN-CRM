export const money = (v: number) => {
  const n = Number(v);

  if (!Number.isFinite(n)) {
    throw new Error("Invalid money value");
  }

  return Math.round((n + Number.EPSILON) * 100) / 100;
};
