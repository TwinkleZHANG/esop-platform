import { EmployeeGrantDetailClient } from "./_detail-client";

export default function EmployeeGrantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <EmployeeGrantDetailClient grantId={params.id} />;
}
