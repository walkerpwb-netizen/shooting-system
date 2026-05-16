import ResetPasswordClient from "./ResetPasswordClient";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token = "" } = await searchParams;

  return (
    <ResetPasswordClient token={token} />
  );
}
