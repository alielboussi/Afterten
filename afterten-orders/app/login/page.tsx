import { LoginForm } from "./LoginForm";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return <LoginForm errorCode={params.error ?? null} />;
}
