import { PlanDetailClient } from "./_plan-detail-client";

export default function PlanDetailPage({ params }: { params: { id: string } }) {
  return <PlanDetailClient planId={params.id} />;
}
