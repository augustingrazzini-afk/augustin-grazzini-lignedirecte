import { redirect } from "next/navigation";
/** Trustpipe se concentre sur le reporting d'appels : ancienne page, redirigée. */
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) { redirect(`/portal/${(await params).clientId}`); }
