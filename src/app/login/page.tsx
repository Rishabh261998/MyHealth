import { redirect } from "next/navigation";
import { getCurrentUser, signupAllowed } from "@/lib/auth";
import AuthForm from "./AuthForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthForm canSignUp={signupAllowed()} />;
}
