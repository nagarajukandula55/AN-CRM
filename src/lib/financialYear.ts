export function getFinancialYear() {

  const now = new Date();

  const year = now.getFullYear();

  const month = now.getMonth() + 1;

  if (month >= 4) {

    return `${String(year).slice(-2)}${String(year + 1).slice(-2)}`;
  }

  return `${String(year - 1).slice(-2)}${String(year).slice(-2)}`;
}
