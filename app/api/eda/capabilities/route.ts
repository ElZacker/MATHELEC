import { NextResponse } from "next/server";
import { getNativeEdaCompatibilityMatrix } from "@/lib/eda/compatibility-matrix";

export function GET() {
  return NextResponse.json({
    stage: "version-aware-compatibility-baseline",
    note: "Las versiones corresponden a las instalaciones confirmadas por el usuario. No se deducen de los archivos de muestra.",
    profiles: getNativeEdaCompatibilityMatrix(),
  });
}
