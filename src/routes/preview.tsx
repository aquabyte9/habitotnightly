import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Habitot" },
      { name: "description", content: "Habitot — a kinder control panel for your day." },
      { property: "og:title", content: "Habitot" },
      { property: "og:description", content: "Habitot — a kinder control panel for your day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewRoute,
});

function PreviewRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
