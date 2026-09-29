import * as Sharing from "expo-sharing";
import { pickDocument, readFileBytes, releaseSelectedAsset, writePrivateFileBytes } from "../../platform/files";
import { VENDOR_INDUCTION_WORKBOOK_MAX_BYTES, VENDOR_INDUCTION_WORKBOOK_MIME } from "../../../../shared/knowledge/vendorInductionWorkbook";
import { selectVendorInductionWorkbook, shareVendorInductionWorkbook } from "./VendorInductionWorkbook";

const mockDelete = jest.fn();
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-file-system", () => ({ File: jest.fn(() => ({ exists: true, delete: mockDelete })) }));
jest.mock("../../platform/files", () => ({ pickDocument: jest.fn(), readFileBytes: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined), writePrivateFileBytes: jest.fn(() => "file:///cache/vendor-induction.xlsx") }));

const asset = { uri: "file:///cache/induction.xlsx", name: "induction.xlsx", mimeType: VENDOR_INDUCTION_WORKBOOK_MIME, size: 1000 };
const question = { id: "question-one", key: "mobilization_days", section: "Capacity", prompt: "How many days to mobilize?", helpText: null, type: "number" as const, required: true, enabled: true, options: [], unit: "days", min: 0, max: 90, showIf: null };

beforeEach(() => jest.clearAllMocks());

it("roundtrips a saved induction workbook through the native picker and releases the file", async () => {
  await shareVendorInductionWorkbook("saved", [question]);
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/vendor-induction.xlsx", expect.objectContaining({ mimeType: VENDOR_INDUCTION_WORKBOOK_MIME }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  const bytes = jest.mocked(writePrivateFileBytes).mock.calls[0]![0];
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockResolvedValueOnce(bytes);
  const preview = await selectVendorInductionWorkbook();
  expect(preview?.legacy).toBe(false);
  expect(preview?.issues).toEqual([]);
  expect(preview?.questions[0]).toMatchObject({ key: question.key, prompt: question.prompt, type: "number", unit: "days" });
  expect(readFileBytes).toHaveBeenCalledWith(asset.uri, VENDOR_INDUCTION_WORKBOOK_MAX_BYTES);
  expect(releaseSelectedAsset).toHaveBeenCalledWith(asset);
});

it("never reads non-xlsx files and cleans up cancelled or failed selections", async () => {
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "cancelled" });
  expect(await selectVendorInductionWorkbook()).toBeNull();
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset: { ...asset, name: "macro.xlsm" } });
  await expect(selectVendorInductionWorkbook()).rejects.toThrow(".xlsx");
  expect(readFileBytes).not.toHaveBeenCalled();
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(1);
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  jest.mocked(readFileBytes).mockRejectedValueOnce(new Error("File exceeds limit"));
  await expect(selectVendorInductionWorkbook()).rejects.toThrow("limit");
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(2);
});
