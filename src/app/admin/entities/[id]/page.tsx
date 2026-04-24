import { EntityDetailClient } from "./_detail-client";

export default function EntityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <EntityDetailClient entityId={params.id} />;
}
