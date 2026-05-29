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
  const initialTab: "users" | "competitions" | "settings" | "monitoring" | "test-data" = (
    params.tab === "competitions"
    || params.tab === "settings"
    || params.tab === "monitoring"
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
