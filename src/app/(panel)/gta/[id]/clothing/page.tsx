"use client";

import { useParams } from "next/navigation";
import { ClothingReviewWorkspace } from "@/components/gta/clothing-review-workspace";

export default function GtaClothingPage() {
  const { id } = useParams<{ id: string }>();
  return <ClothingReviewWorkspace id={id} />;
}
