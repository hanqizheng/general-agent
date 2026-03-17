import { redirect } from "next/navigation";

export default async function SessionPage() {
  redirect("/chat");
}
