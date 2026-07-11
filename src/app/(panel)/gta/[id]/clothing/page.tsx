"use client";

import { useParams } from "next/navigation";
import { ClothingOrganizer } from "@/components/gta/clothing-organizer";

export default function GtaClothingPage() {
  const { id } = useParams<{ id: string }>();
  return <ClothingOrganizer id={id} />;
}
