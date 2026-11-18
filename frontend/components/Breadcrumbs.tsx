import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { siteUrl } from "@/lib/page-metadata";

type Crumb = { label: string; path: `/${string}` };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <>
    <JsonLd data={{
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem", position: index + 1, name: item.label,
        item: new URL(item.path, siteUrl).href,
      })),
    }} />
    <nav aria-label="Okruszki nawigacji" className="mb-5 text-sm">
      <ol className="flex flex-wrap gap-x-2 gap-y-1">
        {items.map((item, index) => <li key={item.path} className="flex gap-2">
          {index > 0 && <span aria-hidden="true">/</span>}
          {index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link className="underline" href={item.path}>{item.label}</Link>}
        </li>)}
      </ol>
    </nav>
  </>;
}
