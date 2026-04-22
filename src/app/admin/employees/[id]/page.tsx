import { EmployeeDetailClient } from "./_employee-detail-client";

export default function EmployeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <EmployeeDetailClient userId={params.id} />;
}
