import { redirect } from "next/navigation";

/**
 * Dimensions live on the Pricing model's General tab, where DR 10 draws them.
 * This route stays so an old bookmark lands somewhere useful.
 */
export default function DimensionsPage() {
    redirect("/pricing/model");
}
