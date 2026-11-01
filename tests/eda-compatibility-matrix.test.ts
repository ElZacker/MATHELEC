import assert from "node:assert/strict";
import test from "node:test";
import {
  getNativeEdaCompatibilityMatrix,
  getNativeEdaCompatibilityProfile,
  getNativeEdaCompatibilityProfileForFile,
} from "../lib/eda/compatibility-matrix";

test("registra las versiones instaladas confirmadas para los tres formatos", () => {
  const profiles = getNativeEdaCompatibilityMatrix();
  assert.deepEqual(
    profiles.map(({ format, application, installedVersion }) => ({
      format,
      application,
      installedVersion,
    })),
    [
      { format: "livewire", application: "Livewire", installedVersion: "1.11" },
      { format: "pcb-wizard", application: "PCB Wizard", installedVersion: "3.50" },
      { format: "proteus", application: "Proteus", installedVersion: "8.13" },
    ],
  );
  assert.ok(profiles.every((profile) => profile.versionSource === "user-confirmed"));
  assert.ok(profiles.every((profile) => profile.versionDetectedInsideFile === false));
});

test("no declara importación, exportación ni round-trip sin decodificadores", () => {
  for (const profile of getNativeEdaCompatibilityMatrix()) {
    assert.equal(profile.capabilities.circuitImport, "not-implemented");
    assert.equal(profile.capabilities.nativeExport, "not-implemented");
    assert.equal(profile.capabilities.applicationOpenTest, "not-verified");
    assert.equal(profile.capabilities.roundTripTest, "not-verified");
  }
});

test("distingue la inspección ZIP parcial de Proteus del reconocimiento por firma New Wave", () => {
  const proteus = getNativeEdaCompatibilityProfile("proteus");
  const livewire = getNativeEdaCompatibilityProfile("livewire");
  const pcbWizard = getNativeEdaCompatibilityProfile("pcb-wizard");

  assert.equal(proteus.capabilities.containerIntegrity, "partial");
  assert.equal(proteus.capabilities.projectMetadata, "partial");
  assert.equal(livewire.capabilities.fileRecognition, "signature-only");
  assert.equal(pcbWizard.capabilities.fileRecognition, "signature-only");
  assert.equal(livewire.capabilities.projectMetadata, "partial");
  assert.equal(pcbWizard.capabilities.projectMetadata, "partial");
});

test("resuelve perfiles por extensión sin confundir las versiones instaladas con versiones del archivo", () => {
  assert.equal(getNativeEdaCompatibilityProfileForFile("circuito.LVW")?.installedVersion, "1.11");
  assert.equal(getNativeEdaCompatibilityProfileForFile("placa.pcb")?.installedVersion, "3.50");
  assert.equal(getNativeEdaCompatibilityProfileForFile("proyecto.pdsprj")?.installedVersion, "8.13");
  assert.equal(getNativeEdaCompatibilityProfileForFile("notas.txt"), null);
});


test("documenta el puente oficial Livewire a PCB Wizard sin declarar importación nativa de Mathelect", () => {
  const livewire = getNativeEdaCompatibilityProfile("livewire");
  const pcbWizard = getNativeEdaCompatibilityProfile("pcb-wizard");
  const proteus = getNativeEdaCompatibilityProfile("proteus");

  for (const path of [...livewire.documentedInteroperability, ...pcbWizard.documentedInteroperability]) {
    assert.equal(path.sourceFormat, "livewire");
    assert.equal(path.targetFormat, "pcb-wizard");
    assert.equal(path.vendorDocumented, true);
    assert.equal(path.applicationSmokeTested, false);
    assert.match(path.evidenceUrl, /^https:\/\//);
  }
  assert.deepEqual(proteus.documentedInteroperability, []);
  assert.equal(livewire.capabilities.circuitImport, "not-implemented");
  assert.equal(livewire.capabilities.nativeExport, "not-implemented");
  assert.equal(pcbWizard.capabilities.circuitImport, "not-implemented");
  assert.equal(pcbWizard.capabilities.nativeExport, "not-implemented");
});


test("calcula barras de avance con hitos ponderados y sin confundirlas con compatibilidad funcional", () => {
  const profiles = getNativeEdaCompatibilityMatrix();
  const byFormat = new Map(profiles.map((profile) => [profile.format, profile]));

  const livewire = byFormat.get("livewire")!;
  const pcbWizard = byFormat.get("pcb-wizard")!;
  const proteus = byFormat.get("proteus")!;

  assert.deepEqual(
    [livewire.progress.percent, livewire.progress.completedCount, livewire.progress.partialCount, livewire.progress.totalCount],
    [19, 1, 1, 8],
  );
  assert.deepEqual(
    [pcbWizard.progress.percent, pcbWizard.progress.completedCount, pcbWizard.progress.partialCount, pcbWizard.progress.totalCount],
    [19, 1, 1, 8],
  );
  assert.deepEqual(
    [proteus.progress.percent, proteus.progress.completedCount, proteus.progress.partialCount, proteus.progress.totalCount],
    [38, 3, 3, 12],
  );

  for (const profile of profiles) {
    assert.match(profile.progress.note, /No representa el porcentaje de archivos compatibles/);
    assert.equal(profile.progress.milestones.length, profile.progress.totalCount);
    assert.ok(profile.progress.percent >= 0 && profile.progress.percent <= 100);
    assert.equal(profile.capabilities.circuitImport, "not-implemented");
    assert.equal(profile.capabilities.nativeExport, "not-implemented");
  }
});
