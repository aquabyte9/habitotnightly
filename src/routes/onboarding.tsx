import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — Habitot" },
      { name: "description", content: "Set up your Habitot profile and goals." },
      { property: "og:title", content: "Welcome — Habitot" },
      { property: "og:description", content: "Set up your Habitot profile and goals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingRoute,
});

function OnboardingRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
