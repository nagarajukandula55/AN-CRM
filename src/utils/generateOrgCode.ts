import Counter from "@/models/Counter";

function padNumber(num: number, size: number): string {
  return num.toString().padStart(size, "0");
}

export async function generateOrganizationCode(): Promise<string> {
  const counterKey = "ORGANIZATION_CODE";

  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    {
      $inc: { value: 1 },
    },
    {
      new: true,
      upsert: true,
    }
  );

  const number = counter.value;

  return `AN${padNumber(number, 4)}`;
}
