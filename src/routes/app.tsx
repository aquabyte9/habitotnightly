import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Your day — Habitot" },
      { name: "description", content: "Your Habitot dashboard: tasks, rhythm, focus and leaderboard." },
      { property: "og:title", content: "Your day — Habitot" },
      { property: "og:description", content: "Your Habitot dashboard: tasks, rhythm, focus and leaderboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppRoute,
});

function AppRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
