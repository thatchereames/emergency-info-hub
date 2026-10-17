export type { EmergencyInfo } from "@/lib/emergency-data";
import { emergencyData } from "@/lib/emergency-data";

export async function GET() {
  return Response.json({ data: emergencyData });
}
