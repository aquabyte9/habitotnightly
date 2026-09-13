import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Habitot" },
      { name: "description", content: "Sign in to Habitot to keep your streak alive." },
      { property: "og:title", content: "Sign in — Habitot" },
      { property: "og:description", content: "Sign in to Habitot to keep your streak alive." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginRoute,
});

function LoginRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
