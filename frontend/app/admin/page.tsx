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
  const initialTab: "users" | "pzss-clubs" | "competitions" | "shooting-ranges" | "shops" | "settings" | "premium" | "payments" | "autopay" | "ads" | "monitoring" | "meta" | "codex" | "qr-scanner" | "target-photo" | "pdf-test" | "test-data" = (
    params.tab === "pzss-clubs"
    || params.tab === "competitions"
    || params.tab === "shooting-ranges"
    || params.tab === "shops"
    || params.tab === "settings"
    || params.tab === "premium"
    || params.tab === "payments"
    || params.tab === "autopay"
    || params.tab === "ads"
    || params.tab === "monitoring"
    || params.tab === "meta"
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
