/// <reference types="vitest/globals" />
import { afterEach, describe, expect, it } from "vitest";
import * as api from "../api";

describe("api client", () => {
  afterEach(() => localStorage.clear());

  it("login stores token via setToken", () => {
    api.setToken("abc");
    expect(api.getToken()).toBe("abc");
  });

  it("getToken returns null when absent", () => {
    expect(api.getToken()).toBeNull();
  });

  it("clearToken removes it", () => {
    api.setToken("abc");
    api.clearToken();
    expect(api.getToken()).toBeNull();
  });
});
