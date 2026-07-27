type Props = {
  title: string
  description: string
}

export default function ModulePage({
  title,
  description,
}: Props) {
  return (
    <div className="space-y-8">
      <section className="rounded-[40px] border border-white/10 bg-white/5 p-10 backdrop-blur-xl">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
          AN GROUP MODULE
        </p>

        <h1 className="mt-6 text-6xl font-black">
          {title}
        </h1>

        <p className="mt-6 text-lg text-slate-300 max-w-3xl">
          {description}
        </p>
      </section>
    </div>
  )
}
