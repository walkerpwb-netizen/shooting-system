import ActivateClient from "./ActivateClient";

type ActivatePageProps = {
  searchParams: Promise<{
    next?: string;
    token?: string;
  }>;
};

export default async function ActivatePage({
  searchParams,
}: ActivatePageProps) {
  const { next = "", token = "" } = await searchParams;

  return (
    <ActivateClient
      token={token}
      redirectPath={next}
    />
  );
}
