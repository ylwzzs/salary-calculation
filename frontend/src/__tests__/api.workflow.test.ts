/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { monthsApi, workflowApi } from "../api";

describe("workflow api shape", () => {
  it("monthsApi has create/list/get", () => {
    expect(typeof monthsApi.create).toBe("function");
    expect(typeof monthsApi.list).toBe("function");
    expect(typeof monthsApi.get).toBe("function");
  });
  it("workflowApi has the month endpoints", () => {
    for (const k of ["importSales", "importGifts", "inferDuty", "getDuty", "setDuty", "compute", "getResults"]) {
      expect(typeof (workflowApi as any)[k]).toBe("function");
    }
  });
});
