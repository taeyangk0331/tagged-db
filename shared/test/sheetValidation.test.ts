import { describe, expect, it } from "@jest/globals";
import { parseTags } from "../src/sheetValidation.js";

describe("sheetValidation", () => {
  describe("parseTags", () => {
    it("should correctly parse simple list", () => {
      expect(parseTags("a, b, c")).toEqual(["a", "b", "c"]);
    });

    it("should correctly parse empty string", () => {
      expect(parseTags("")).toEqual([]);
    });

    it("should correctly parse single tag", () => {
      expect(parseTags("a")).toEqual(["a"]);
    });
  });
});
