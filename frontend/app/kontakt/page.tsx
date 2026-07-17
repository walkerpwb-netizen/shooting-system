import type { Metadata } from "next";

import SocialMediaIcons from "@/components/SocialMediaIcons";

export const metadata: Metadata = {
  title: "Kontakt | System Strzelecki",
  description: "Skontaktuj się z zespołem System-Strzelecki.pl.",
};

const contactTopics = [
  {
    title: "Pomysły i rozwój systemu",
    text: "Masz sugestię dotyczącą strony? Chcesz, abyśmy dodali nową funkcję, zmienili istniejące rozwiązanie albo usprawnili obsługę zawodów? Napisz — chętnie poznamy Twój pomysł.",
  },
  {
    title: "Pomoc techniczna",
    text: "Masz problem z logowaniem, rejestracją, profilem, płatnością albo działaniem systemu? Opisz, co się wydarzyło. Jeśli możesz, dołącz treść komunikatu, zrzut ekranu oraz nazwę używanej przeglądarki.",
  },
  {
    title: "Współpraca i rozwiązania indywidualne",
    text: "Potrzebujesz funkcji przygotowanej specjalnie dla klubu, organizatora, strzelnicy lub cyklu zawodów? Porozmawiajmy o indywidualnym wdrożeniu, integracji albo dopasowaniu systemu do Twojej pracy.",
  },
  {
    title: "Reklama i promocja",
    text: "Chcesz umieścić na naszej stronie reklamę, zaprezentować markę, wydarzenie, klub, strzelnicę lub ofertę skierowaną do środowiska strzeleckiego? Skontaktuj się z nami — wspólnie wybierzemy odpowiednią formę promocji.",
  },
];

export default function ContactPage() {
  return (
    <main
      className="min-h-screen text-white"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 22%, rgba(28, 176, 159, 0.32), transparent 38%), linear-gradient(90deg, rgba(0, 0, 0, 0.32), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.38)), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 8px), linear-gradient(180deg, #087466 0%, #064c43 45%, #042d2a 100%)",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="w-full px-5 py-12 sm:px-8 sm:py-16">
        <section className="rounded-3xl border border-emerald-200/25 bg-black/35 p-6 shadow-2xl backdrop-blur-sm sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-200">
            Jesteśmy do Twojej dyspozycji
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">
            Kontakt
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-emerald-50 sm:text-xl">
            Pytanie, pomysł, problem techniczny, współpraca lub reklama? Napisz do nas. Każdą wiadomość traktujemy jako szansę, by System Strzelecki był wygodniejszy i lepiej odpowiadał na potrzeby użytkowników.
          </p>

          <a
            href="mailto:info@system-strzelecki.pl"
            className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-300 px-6 py-4 text-lg font-black text-emerald-950 shadow-xl transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-200/60 sm:w-auto"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
              <path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.2L20.1 7H3.9L12 12.2Zm0 2.4L3 8.8V17h18V8.8l-9 5.8Z" />
            </svg>
            info@system-strzelecki.pl
          </a>

          <p className="mt-3 text-sm text-emerald-100/85">
            Kliknięcie adresu otworzy domyślną aplikację pocztową na Twoim urządzeniu.
          </p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          {contactTopics.map((topic) => (
            <article
              key={topic.title}
              className="rounded-2xl border border-white/15 bg-emerald-950/55 p-6 shadow-xl backdrop-blur-sm"
            >
              <h2 className="text-2xl font-black text-emerald-100">
                {topic.title}
              </h2>
              <p className="mt-3 text-base leading-7 text-emerald-50/90">
                {topic.text}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-white/15 bg-black/30 p-6 sm:p-8">
          <h2 className="text-2xl font-black text-white">Znajdź nas także tutaj</h2>
          <p className="mt-2 max-w-2xl leading-7 text-emerald-50/90">
            Jesteśmy na Facebooku, Instagramie i Messengerze. Możesz też od razu otworzyć wiadomość e-mail do naszego zespołu.
          </p>
          <div className="mt-5">
            <SocialMediaIcons />
          </div>
        </section>
      </div>
    </main>
  );
}
