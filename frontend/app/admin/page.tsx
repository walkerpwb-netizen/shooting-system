import AdminClient from "./AdminClient";

type AdminPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function AdminPage({
  searchParams,
}: AdminPageProps) {
  const params = await searchParams;
  const initialTab: "users" | "pzss-clubs" | "competitions" | "shooting-ranges" | "settings" | "premium" | "ads" | "monitoring" | "codex" | "qr-scanner" | "target-photo" | "pdf-test" | "test-data" = (
    params.tab === "pzss-clubs"
    || params.tab === "competitions"
    || params.tab === "shooting-ranges"
    || params.tab === "settings"
    || params.tab === "premium"
    || params.tab === "ads"
    || params.tab === "monitoring"
    || params.tab === "codex"
    || params.tab === "qr-scanner"
    || params.tab === "target-photo"
    || params.tab === "pdf-test"
    || params.tab === "test-data"
  )
    ? params.tab
    : "users";

  return (
    <AdminClient
      key={initialTab}
      initialTab={initialTab}
    />
  );
}
