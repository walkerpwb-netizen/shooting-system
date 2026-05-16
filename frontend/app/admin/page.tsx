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
  const initialTab: "users" | "competitions" | "settings" = params.tab === "competitions" || params.tab === "settings"
    ? params.tab
    : "users";

  return (
    <AdminClient
      key={initialTab}
      initialTab={initialTab}
    />
  );
}
