import type { Metadata } from "next";
import { SettingsNav } from "../../settings-nav";
import { BoardLoader } from "./board-loader";

export const metadata: Metadata = { title: "Onboarding board" };

export default function OnboardingBoardPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <BoardLoader />
        </div>
    );
}
