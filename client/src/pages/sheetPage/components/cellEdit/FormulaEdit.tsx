import styled from "styled-components";
import { FormulaColumn, SheetData } from "@app/shared/types/sheet";
import { Starlark } from "starlark-wasm";
import wasmUrl from "starlark-wasm/wasm?url";
import { useEffect, useState } from "react";
import { parseRowvalue } from "@app/shared/sheetValidation";
import {
  createModule,
  DEFAULT_FORMULA_TYPE,
  DEFAULT_FORMULAS,
  MAIN_FUNCTION,
} from "@app/shared/formula";
import { COLORS } from "../../../../styles/colors";

const Container = styled.div`
  display: flex;
  align-items: center;
  flex-grow: 1;
  gap: 4px;
  width: fix-content;

  font-family: monospace;
  color: #072907be;
  font-weight: 800;
  background-color: ${COLORS.CODE_BLOCK};
  padding: 2px 8px;
`;

interface Props {
  rowId: string;
  column: FormulaColumn;
  sheetData: SheetData;
}

const runtimePromise = Starlark.init(wasmUrl);

export const FormulaEdit = ({ rowId, column, sheetData }: Props) => {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    runtimePromise.then(() => {
      setRuntimeReady(true);
    });
  }, []);

  useEffect(() => {
    setOutput("");
  }, [rowId, column]);

  useEffect(() => {
    if (runtimeReady) {
      const rowsInput: Record<string | number, string | number | null> = {};
      const currentRow = sheetData.rows.find((row) => row.id === rowId);

      if (!currentRow) {
        return;
      }

      if (!column.formula) {
        return;
      }

      // Fill up row values
      for (let i = sheetData.columns.length - 1; i >= 0; i--) {
        // go backward to first column name gets precedence
        const column = sheetData.columns[i];
        rowsInput[column.title] = parseRowvalue(
          column.type,
          currentRow.values[column.id],
        );
      }
      // Fill up column by index
      for (let i = 0; i < sheetData.columns.length; i++) {
        const column = sheetData.columns[i];
        rowsInput[i] = parseRowvalue(column.type, currentRow.values[column.id]);
      }

      const code = createModule(
        column.formulaType ?? DEFAULT_FORMULA_TYPE,
        column.formula ??
          DEFAULT_FORMULAS[column.formulaType ?? DEFAULT_FORMULA_TYPE],
        sheetData.columns.filter((c) => c.type !== "formula"),
        currentRow,
      );

      new Starlark({
        // load gives you module loading
        load: async (filename) => {
          const files: Record<string, string> = {
            "main.star": code,
          };
          return files[filename];
        },
        print: (message) => {
          console.log(message);
        },
      })
        .run(
          "main.star", // the file to run
          MAIN_FUNCTION, // the function to call
          [rowsInput], // the args for the function
          {}, // the kwargs for the function
          1, // maximum execution seconds before timeout
        )
        .then((result) => {
          setOutput(String(result));
          setError("");
        })
        .catch((error) => {
          setError(String(error));
        });
    }
  }, [column.formula, column.formulaType, rowId, runtimeReady, sheetData]);

  if (!runtimeReady) {
    return (
      <Container>
        <div
          style={{
            fontFamily: "monospace",
            color: "grey",
            fontSize: "small",
            fontWeight: 600,
          }}
        >
          Computing...
        </div>
      </Container>
    );
  }

  return (
    <Container>
      {error ? (
        <div
          style={{ fontFamily: "monospace", color: "red", fontSize: "small" }}
        >
          {error}
        </div>
      ) : (
        <div>
          {output ? (
            output
          ) : (
            <span
              style={{
                opacity: 0,
              }}
            >
              -
            </span>
          )}
        </div>
      )}
    </Container>
  );
};
