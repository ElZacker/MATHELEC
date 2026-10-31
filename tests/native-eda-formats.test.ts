import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { inspectNativeEdaProject } from "../lib/eda/native-project-inspector";

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), "archivosdeprueba", "compatibilidad", name));

test("Livewire: reconoce la firma Dsg del archivo de referencia sin inventar componentes", () => {
  const result = inspectNativeEdaProject("Mathelecprueba.lvw", fixture("Mathelecprueba.lvw"));
  assert.equal(result.format, "livewire");
  assert.equal(result.targetApplication.application, "Livewire");
  assert.equal(result.targetApplication.installedVersion, "1.11");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.recognized, true);
  assert.equal(result.signature, "Dsg\\0");
  assert.equal(result.componentDataDecoded, false);
  assert.ok(result.byteLength > 32);
});

test("PCB Wizard: reconoce la firma Dsg y conserva su identidad por extensión", () => {
  const result = inspectNativeEdaProject("Mathelecprueba.pcb", fixture("Mathelecprueba.pcb"));
  assert.equal(result.format, "pcb-wizard");
  assert.equal(result.targetApplication.application, "PCB Wizard");
  assert.equal(result.targetApplication.installedVersion, "3.50");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.recognized, true);
  assert.equal(result.signature, "Dsg\\0");
  assert.equal(result.componentDataDecoded, false);
  assert.ok(result.byteLength > 32);
});

test("Proteus: valida el contenedor y los archivos internos esenciales del proyecto real", () => {
  const result = inspectNativeEdaProject("mathelecprueba.pdsprj", fixture("mathelecprueba.pdsprj"));
  assert.equal(result.format, "proteus");
  assert.equal(result.targetApplication.application, "Proteus");
  assert.equal(result.targetApplication.installedVersion, "8.13");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.container, "zip");
  assert.equal(result.hasProjectXml, true);
  assert.equal(result.hasRootDsn, true);
  assert.equal(result.hasRootCdb, true);
  assert.equal(result.schematicDecoded, false);
  assert.equal(result.status, "recognized-project-with-partial-component-metadata");
  assert.equal(result.componentMetadata.status, "partial");
  assert.equal(result.componentMetadata.source, "ROOT.CDB");
  assert.equal(result.componentMetadata.count, 3);
  assert.deepEqual(
    result.componentMetadata.components.map(({ reference, value, device, package: packageName }) => ({
      reference,
      value,
      device,
      package: packageName,
    })),
    [
      { reference: "B1", value: "9V", device: "BATTERY", package: "" },
      { reference: "D1", value: "LED-RED", device: "LED-RED", package: "" },
      { reference: "R1", value: "1k", device: "10WATT1K", package: "RES180" },
    ],
  );
  assert.equal(result.componentMetadata.components.find((component) => component.reference === "D1")?.properties.VF, "2.2V");
  assert.equal(result.componentMetadata.components.find((component) => component.reference === "R1")?.properties.PRIMTYPE, "RESISTOR");
  assert.ok(result.entries.some((entry) => entry.name.toUpperCase() === "PROJECT.XML"));
  assert.ok(result.entries.some((entry) => entry.name.toUpperCase() === "ROOT.DSN"));
});

test("rechaza extensiones no admitidas", () => {
  assert.throws(
    () => inspectNativeEdaProject("circuito.txt", Buffer.from("not a circuit")),
    /Formato no admitido/,
  );
});

test("rechaza archivos New Wave con firma incorrecta", () => {
  assert.throws(
    () => inspectNativeEdaProject("archivo.lvw", Buffer.from("not a Livewire file")),
    /firma binaria Dsg/,
  );
});

test("rechaza un proyecto Proteus que no sea ZIP", () => {
  assert.throws(
    () => inspectNativeEdaProject("archivo.pdsprj", Buffer.from("not a Proteus project")),
    /ZIP válido|demasiado pequeño/,
  );
});
