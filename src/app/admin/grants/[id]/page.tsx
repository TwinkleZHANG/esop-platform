import { GrantDetailClient } from "./_detail-client";

export default function GrantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <GrantDetailClient grantId={params.id} />;
}
