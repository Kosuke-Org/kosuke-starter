import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

const principles = [
  { title: "Start with one page", text: "Say who it is for and what it does. Nothing more." },
  { title: "Add only what people need", text: "Sign-in, data and payments come when the product asks for them." },
  { title: "Ship today, improve tomorrow", text: "A live page teaches more than a perfect plan." },
];

function Home() {
  return (
    <div className="flex flex-1 px-6 pt-16 pb-24 sm:pt-28 sm:pb-32">
      <article className="mx-auto w-full max-w-xl">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance break-words sm:text-5xl">
          Less, but better.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">
          Every good product starts as a single page. Say what it is for, and let it grow from there.
        </p>
        <ol className="mt-12 flex flex-col gap-6">
          {principles.map((p, i) => (
            <li key={p.title} className="grid grid-cols-[2rem_1fr] gap-x-3">
              <span className="pt-px text-sm text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
