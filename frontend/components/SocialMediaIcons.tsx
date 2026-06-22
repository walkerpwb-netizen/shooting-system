type SocialMediaIconsProps = {
  compact?: boolean;
};

const socialMedia = [
  {
    name: "Facebook",
    color: "bg-[#1877F2]",
    icon: (
      <path d="M14.4 8.5h3V5h-3.5C10.6 5 9 7 9 10v2H6v3.5h3V23h4v-7.5h3.2l.6-3.5H13v-1.7c0-1.2.4-1.8 1.4-1.8Z" />
    ),
  },
  {
    name: "Instagram",
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
    color: "bg-gradient-to-br from-[#00B2FF] to-[#7B2CFF]",
    icon: (
      <path d="M14 4C8.5 4 4 8.1 4 13.2c0 2.9 1.5 5.5 3.8 7.2V24l3.4-1.9c.9.2 1.8.3 2.8.3 5.5 0 10-4.1 10-9.2S19.5 4 14 4Zm1 12-2.5-2.7-4.8 2.7 5.3-5.7 2.5 2.7 4.8-2.7L15 16Z" />
    ),
  },
  {
    name: "YouTube",
    color: "bg-[#FF0000]",
    icon: (
      <>
        <rect x="3" y="6" width="22" height="16" rx="5" />
        <path d="m12 10 6 4-6 4v-8Z" className="fill-white" />
      </>
    ),
  },
];

export default function SocialMediaIcons({ compact = false }: SocialMediaIconsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      aria-label="Media społecznościowe — profile zostaną udostępnione wkrótce"
    >
      {socialMedia.map((social) => (
        <span
          key={social.name}
          title={`${social.name} — profil wkrótce`}
          aria-label={`${social.name} — profil wkrótce`}
          role="img"
          className={`inline-flex items-center justify-center rounded-full text-white shadow-lg ring-1 ring-white/25 ${social.color} ${
            compact ? "h-9 w-9" : "h-12 w-12"
          }`}
        >
          <svg
            viewBox="0 0 28 28"
            aria-hidden="true"
            className={compact ? "h-5 w-5" : "h-7 w-7"}
            fill="currentColor"
          >
            {social.icon}
          </svg>
        </span>
      ))}
    </div>
  );
}
