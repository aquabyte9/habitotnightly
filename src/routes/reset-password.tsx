import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import HabitotApp from "../habitot-app";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Habitot" },
      { name: "description", content: "Choose a new Habitot password and get back to your streak." },
      { property: "og:title", content: "Reset your password — Habitot" },
      { property: "og:description", content: "Choose a new Habitot password and get back to your streak." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-ink" />}>
      <HabitotApp />
    </ClientOnly>
  );
}
