import { NextResponse } from "next/server";
import { inspectNativeEdaProject } from "@/lib/eda/native-project-inspector";


const MAX_NATIVE_FILE_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba una solicitud multipart/form-data con el campo file." },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file");
  if (
    !uploaded ||
    typeof uploaded === "string" ||
    typeof uploaded.name !== "string" ||
    typeof uploaded.arrayBuffer !== "function"
  ) {
    return NextResponse.json(
      { error: "Falta el archivo en el campo file." },
      { status: 400 },
    );
  }

  if (uploaded.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }
  if (uploaded.size > MAX_NATIVE_FILE_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el límite de 12 MB para inspección." },
      { status: 413 },
    );
  }

  try {
    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    return NextResponse.json(inspectNativeEdaProject(uploaded.name, bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo inspeccionar el archivo.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
