import { redirect } from "next/navigation";

/** Templates now live at the Comms root. */
export default function TemplatesPage() {
    redirect("/comms");
}
