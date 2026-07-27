interface StepperProps {
  step: number;
}

export default function Stepper({
  step,
}: StepperProps) {
  // Order matters: Structure (unit/pack size) must come before BOM (material
  // quantities depend on unit), and BOM must come before Commercial (the
  // selling-price suggestion is computed FROM the BOM cost) -- was
  // Basic Info -> Commercial -> Structure -> BOM, which asked for pricing
  // before any cost existed to price against, showing "no BOM cost yet" at
  // exactly the step meant to guide pricing.
  const steps = [
    "Basic Info",
    "Structure",
    "BOM",
    "Commercial",
    "Packaging",
    "Compliance",
    "Review",
    "Submit",
  ];

  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((title, index) => {
        const current = index + 1;

        return (
          <div
            key={title}
            className="flex flex-1 items-center"
          >
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  current <= step
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                {current}
              </div>

              <span className="mt-2 text-xs text-center">
                {title}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`mx-2 h-1 flex-1 ${
                  current < step
                    ? "bg-blue-600"
                    : "bg-gray-300"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
