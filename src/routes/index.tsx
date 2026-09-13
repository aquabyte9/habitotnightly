import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Habitot — Keep the streak. Run your day." },
      {
        name: "description",
        content:
          "Habitot is a kinder control panel for your day: habits, tasks, calendar, focus and a friendly leaderboard in one warm place.",
      },
      { property: "og:title", content: "Habitot — Keep the streak. Run your day." },
      {
        property: "og:description",
        content:
          "Habitot keeps the small promises visible: the task that matters, the appointment ahead, the focus you are trying to protect.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
