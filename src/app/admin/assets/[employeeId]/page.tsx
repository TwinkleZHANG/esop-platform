import { EmployeeAssetDetailClient } from "./_detail-client";

export default function EmployeeAssetPage({
  params,
}: {
  params: { employeeId: string };
}) {
  return <EmployeeAssetDetailClient employeeId={params.employeeId} />;
}
