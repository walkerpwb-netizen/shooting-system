type SocialMediaIconsProps = {
  compact?: boolean;
  className?: string;
};

const socialMedia = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/Systemstrzelecki",
    color: "bg-[#1877F2]",
    icon: (
      <path d="M14.4 8.5h3V5h-3.5C10.6 5 9 7 9 10v2H6v3.5h3V23h4v-7.5h3.2l.6-3.5H13v-1.7c0-1.2.4-1.8 1.4-1.8Z" />
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/systemstrzelecki",
    color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45]",
    icon: (
      <>
        <rect x="5" y="5" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2.3" />
        <circle cx="14" cy="14" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.3" />
        <circle cx="20" cy="8.8" r="1.3" />
      </>
    ),
  },
  {
    name: "Messenger",
    href: "https://m.me/systemstrzelecki",
    color: "bg-gradient-to-br from-[#00B2FF] to-[#7B2CFF]",
    icon: (
      <path d="M14 4C8.5 4 4 8.1 4 13.2c0 2.9 1.5 5.5 3.8 7.2V24l3.4-1.9c.9.2 1.8.3 2.8.3 5.5 0 10-4.1 10-9.2S19.5 4 14 4Zm1 12-2.5-2.7-4.8 2.7 5.3-5.7 2.5 2.7 4.8-2.7L15 16Z" />
    ),
  },
  {
    name: "E-mail",
    href: "mailto:info@system-strzelecki.pl",
    color: "bg-emerald-600",
    icon: (
      <path d="M4 6h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm10 9L24 8H4l10 7Zm0 2.5L4 10.6V20h20v-9.4l-10 6.9Z" />
    ),
  },
];

export default function SocialMediaIcons({
  compact = false,
  className = "",
}: SocialMediaIconsProps) {
  return (
    <div
      className={`flex flex-wrap items-center ${compact ? "gap-2" : "gap-3"} ${className}`}
      aria-label="Media społecznościowe Systemu Strzeleckiego"
    >
      {socialMedia.map((social) => {
        const icon = (
          <svg
            viewBox="0 0 28 28"
            aria-hidden="true"
            className={compact ? "h-5 w-5" : "h-7 w-7"}
            fill="currentColor"
          >
            {social.icon}
          </svg>
        );
        const iconClassName = `inline-flex items-center justify-center rounded-full text-white shadow-lg ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:shadow-emerald-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 ${social.color} ${
          compact ? "h-8 w-8" : "h-12 w-12"
        }`;

        if (!social.href) {
          return (
            <span
              key={social.name}
              title={`${social.name} — profil wkrótce`}
              aria-label={`${social.name} — profil wkrótce`}
              role="img"
              className={`${iconClassName} cursor-not-allowed opacity-70`}
            >
              {icon}
            </span>
          );
        }

        return (
          <a
            key={social.name}
            href={social.href}
            target={social.href.startsWith("mailto:") ? undefined : "_blank"}
            rel={social.href.startsWith("mailto:") ? undefined : "noreferrer"}
            title={`Otwórz ${social.name} Systemu Strzeleckiego`}
            aria-label={`Otwórz ${social.name} Systemu Strzeleckiego`}
            className={iconClassName}
          >
            {icon}
          </a>
        );
      })}
    </div>
  );
}
