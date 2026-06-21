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
  const initialTab: "users" | "pzss-clubs" | "competitions" | "settings" | "ads" | "monitoring" | "qr-scanner" | "test-data" = (
    params.tab === "pzss-clubs"
    || params.tab === "competitions"
    || params.tab === "settings"
    || params.tab === "ads"
    || params.tab === "monitoring"
    || params.tab === "qr-scanner"
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
