import * as Sharing from "expo-sharing";
import { pickDocument, readFileBytes, releaseSelectedAsset, writePrivateFileBytes } from "../../platform/files";
import { selectQualityWorkbook, shareQualityWorkbook, QUALITY_WORKBOOK_MIME } from "./KnowledgeQualityWorkbook";

const mockDelete = jest.fn();
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-file-system", () => ({ File: jest.fn(() => ({ exists: true, delete: mockDelete })) }));
jest.mock("../../platform/files", () => ({ pickDocument: jest.fn(), readFileBytes: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined), writePrivateFileBytes: jest.fn(() => "file:///cache/export.xlsx") }));
const options = { frequency: [], performer: [] };
const asset = { uri: "file:///cache/import.xlsx", name: "import.xlsx", mimeType: QUALITY_WORKBOOK_MIME, size: 500 };

beforeEach(() => { jest.clearAllMocks(); });

it("exports and parses real XLSX bytes through the native browser bundle, preserving full checks", async () => {
  const parameter = { id: "check-a", label: "Gap tolerance", type: "number", minimum: "1.25", maximum: "3.50", unit: "mm", required: true, active: true, severity: "major", responsibleRole: "site", sampling: { method: "all", unit: "room" }, evidence: { photos: true, minPhotosPerSample: 2, documents: true, video: false, instructions: "Show the measured joint" } };
  await shareQualityWorkbook("saved", "Joinery", [parameter], options);
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/export.xlsx", expect.objectContaining({ mimeType: QUALITY_WORKBOOK_MIME }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  const bytes = jest.mocked(writePrivateFileBytes).mock.calls[0]![0];
  expect(bytes.byteLength).toBeGreaterThan(100);
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockResolvedValueOnce(bytes);
  const parsed = await selectQualityWorkbook(options);
  expect(parsed?.issues).toEqual([]);
  expect(parsed?.parameters[0]).toMatchObject({ ...parameter, id: expect.any(String) });
  expect(readFileBytes).toHaveBeenCalledWith(asset.uri, 5 * 1024 * 1024);
  expect(releaseSelectedAsset).toHaveBeenCalledWith(asset);
});

it("releases unreadable selections and never parses unsupported extensions", async () => {
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset: { ...asset, name: "macro.xlsm" } });
  await expect(selectQualityWorkbook(options)).rejects.toThrow(".xlsx");
  expect(readFileBytes).not.toHaveBeenCalled();
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(1);
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockRejectedValueOnce(new Error("File exceeds limit"));
  await expect(selectQualityWorkbook(options)).rejects.toThrow("limit");
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(2);
});

it("cleans private exports after cancelled or failed sharing and supports picker cancellation", async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("Sharing cancelled"));
  await expect(shareQualityWorkbook("template", "Joinery", [], options)).rejects.toThrow("cancelled");
  expect(mockDelete).toHaveBeenCalledTimes(1);
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "cancelled" });
  expect(await selectQualityWorkbook(options)).toBeNull();
  expect(readFileBytes).not.toHaveBeenCalled();
});

it("roundtrips the actual template through the bounded native preflight", async () => {
  await shareQualityWorkbook("template", "Joinery", [], options);
  const bytes = jest.mocked(writePrivateFileBytes).mock.calls[0]![0];
  const ExcelJS: typeof import("exceljs") = require("exceljs/dist/exceljs.min.js");
  const template = new ExcelJS.Workbook();
  await template.xlsx.load(Uint8Array.from(bytes).buffer);
  template.getWorksheet("Quality Parameters")!.getRow(2).values = ["Is the panel undamaged?", "dropdown", "Pass|Fail", "No visible damage", "Major", null, null, null, "Per room", "Site", 2];
  const completed = new Uint8Array(await template.xlsx.writeBuffer());
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockResolvedValueOnce(completed);
  const parsed = await selectQualityWorkbook(options);
  expect(parsed?.issues).toEqual([]);
  expect(parsed?.parameters[0]).toMatchObject({ label: "Is the panel undamaged?", type: "dropdown" });
  expect(releaseSelectedAsset).toHaveBeenCalledWith(asset);
});

it("rejects false expanded sizes before constructing ExcelJS and always releases the selection", async () => {
  await shareQualityWorkbook("template", "Joinery", [], options);
  const bytes = Uint8Array.from(jest.mocked(writePrivateFileBytes).mock.calls[0]![0]);
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  let directory = view.getUint32(end + 16, true);
  // Forge matching local/central sizes for one nonempty real template member.
  while (view.getUint32(directory + 24, true) === 0) directory += 46 + view.getUint16(directory + 28, true) + view.getUint16(directory + 30, true) + view.getUint16(directory + 32, true);
  const local = view.getUint32(directory + 42, true);
  view.setUint32(directory + 24, 0, true); view.setUint32(local + 22, 0, true);
  const ExcelJS = require("exceljs/dist/exceljs.min.js");
  const constructor = jest.spyOn(ExcelJS, "Workbook");
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockResolvedValueOnce(bytes);
  try {
    await expect(selectQualityWorkbook(options)).rejects.toThrow("incomplete or inconsistent");
    expect(constructor).not.toHaveBeenCalled();
    expect(releaseSelectedAsset).toHaveBeenCalledWith(asset);
  } finally { constructor.mockRestore(); }
});
