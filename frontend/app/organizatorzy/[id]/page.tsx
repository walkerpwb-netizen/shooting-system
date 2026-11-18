import Breadcrumbs from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageMetadata } from "@/lib/page-metadata";
import { getOrganizer } from "@/lib/public-organizers";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
async function organizerFor(params: Props["params"]) {
  const organizer = await getOrganizer((await params).id);
  if (!organizer) notFound();
  return organizer;
}
export async function generateMetadata({ params }: Props) {
  const organizer = await organizerFor(params);
  return createPageMetadata({ path: `/organizatorzy/${organizer.id}`, title: `${organizer.name} | Organizator`, description: organizer.description.slice(0, 155) });
}
export default async function OrganizerPage({ params }: Props) {
  const organizer = await organizerFor(params);
  const groups = [
    { title: "Aktualne wydarzenia", events: organizer.events.filter((e) => e.status !== "completed") },
    { title: "Zakończone wydarzenia", events: organizer.events.filter((e) => e.status === "completed") },
  ];
  return <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
    <Breadcrumbs items={[{ label: "Strona główna", path: "/" }, { label: "Organizatorzy wydarzeń", path: "/organizatorzy" }, { label: organizer.name, path: `/organizatorzy/${organizer.id}` }]} />
    <h1 className="text-3xl font-black">{organizer.name}</h1>
    <p className="mt-6 whitespace-pre-wrap">{organizer.description}</p>
    {groups.map((group) => <section key={group.title} className="mt-10">
      <h2 className="text-2xl font-bold">{group.title}</h2>
      {group.events.length ? <ul className="mt-4 space-y-4">{group.events.map((event) => <li key={event.id}>
        <Link className="font-bold underline" href={`/${event.event_type === "training" ? "trainings" : "competitions"}/${event.id}`}>{event.name}</Link>
        <p>{event.date} · {event.location} · {event.event_type === "training" ? "Szkolenie" : "Zawody"}</p>
      </li>)}</ul> : <p className="mt-4">Brak wydarzeń.</p>}
    </section>)}
  </main>;
}
