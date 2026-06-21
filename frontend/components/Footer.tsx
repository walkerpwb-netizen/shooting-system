import Link from "next/link";

const footerLinks = [
  {
    href: "/regulamin",
    label: "Regulamin",
  },
  {
    href: "/polityka-prywatnosci",
    label: "Polityka prywatności",
  },
  {
    href: "/publikacja-wynikow",
    label: "Publikacja wyników",
  },
];

export default function Footer() {
  return (
    <footer className="w-full border-t border-green-800 bg-green-950 px-6 py-6 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Linki prawne"
          className="flex flex-col gap-3 text-sm font-semibold text-green-100 sm:flex-row sm:items-center sm:gap-6"
        >
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
