import { notFound } from "next/navigation";
import { ResourcePage } from "@/components/agendamiento/resource-page";
import { RESOURCES, isResourceKey } from "@/lib/agendamiento/resources";

export function generateStaticParams() {
  return Object.keys(RESOURCES).map((resource) => ({ resource }));
}

export default async function Page({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!isResourceKey(resource)) notFound();
  return <ResourcePage key={resource} resourceKey={resource} />;
}
