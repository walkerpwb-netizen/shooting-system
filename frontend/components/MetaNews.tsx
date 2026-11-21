import Link from "next/link";
import { apiUrl } from "@/lib/api";

type Post = {
  id: number;
  source: "facebook" | "instagram";
  text: string;
  published_at: string;
  permalink: string;
  media: { url: string; type: "image" | "video" }[];
};

export async function getMetaNews(page = 1, strict = false): Promise<{ posts: Post[]; has_more: boolean }> {
  try {
    const response = await fetch(apiUrl(`/meta-news?page=${page}`), { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("news unavailable");
    const data = await response.json();
    if (!data || !Array.isArray(data.posts) || typeof data.has_more !== "boolean") throw new Error("invalid news response");
    return data;
  } catch (error) {
    if (strict) throw error;
    return { posts: [], has_more: false };
  }
}

export default function MetaNews({ posts, hasMore, page = 1 }: { posts: Post[]; hasMore: boolean; page?: number }) {
  return (
    <section aria-labelledby="home-news-title" className="border-t border-white/8 py-10 lg:py-16">
      <div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Co nowego</p>
        <h2 id="home-news-title" className="mt-3 text-3xl font-black text-white sm:text-4xl">Aktualności</h2></div>
      {!posts.length && <p className="text-zinc-400">Brak aktualności do wyświetlenia.</p>}
      <div className="space-y-7">
        {posts.map((post) => <article key={`${post.source}-${post.id}`} className="grid gap-7 rounded-2xl border border-white/12 bg-white/[0.05] p-5 sm:p-7 lg:grid-cols-2 lg:items-start">
          <div>
            <time dateTime={post.published_at} className="block text-base font-bold text-emerald-200 sm:text-lg">Opublikowano: {new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "Europe/Warsaw" }).format(new Date(post.published_at))}</time>
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-emerald-300">{post.source === "facebook" ? "Facebook" : "Instagram"}</p>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-zinc-200">{post.text}</p>
            <a className="mt-4 inline-block font-bold text-emerald-300 underline" href={post.permalink} target="_blank" rel="noopener noreferrer">Zobacz oryginalny post</a>
          </div>
          {post.media.length > 0 && <div className="grid grid-cols-2 gap-2">{post.media.map((media, index) => <a key={`${index}-${media.url}`} href={media.type === "video" ? post.permalink : media.url} target="_blank" rel="noopener noreferrer" className={`relative overflow-hidden rounded-xl border border-white/10 ${post.media.length === 1 ? "col-span-2" : ""}`}>
            {/* Images are provided by Meta and may use different CDN hosts. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.url} alt={media.type === "video" ? "Miniatura filmu z aktualności" : "Zdjęcie z aktualności"} loading="lazy" className="h-full w-full object-cover" />
            {media.type === "video" && <span className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-sm">Film</span>}
          </a>)}</div>}
        </article>)}
      </div>
      <nav aria-label="Strony aktualności" className="mt-7 flex gap-5 font-bold text-emerald-300">
        {page > 1 && <Link href={page === 2 ? "/" : `/aktualnosci?strona=${page - 1}`}>Nowsze aktualności</Link>}
        {hasMore && <Link href={`/aktualnosci?strona=${page + 1}`}>Pokaż więcej</Link>}
      </nav>
    </section>
  );
}
