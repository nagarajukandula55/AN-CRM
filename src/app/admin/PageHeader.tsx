interface Props {
  title: string;
  subtitle?: string;
}

export default function PageHeader({
  title,
  subtitle,
}: Props) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold">
        {title}
      </h1>

      {subtitle && (
        <p className="mt-2 text-zinc-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}
