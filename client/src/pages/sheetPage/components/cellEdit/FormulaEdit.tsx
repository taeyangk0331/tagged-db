import styled from "styled-components";
import { useEffect, useState } from "react";
import { COLORS } from "../../../../styles/colors";
import {
  ComputedValue,
  starlarkRuntimePromise,
} from "../../../../utils/formulaComputation";

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
  value?: ComputedValue;
}

export const FormulaEdit = ({ value }: Props) => {
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    starlarkRuntimePromise.then(() => {
      setRuntimeReady(true);
    });
  }, []);

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

  if (value?.ok) {
    if (value.value === undefined || value.value === null) {
      return (
        <Container>
          <div
            style={{
              fontFamily: "monospace",
              color: "grey",
              fontSize: "small",
              fontWeight: 600,
              userSelect: "none",
            }}
          >
            -
          </div>
        </Container>
      );
    }

    return (
      <Container style={{ minHeight: "20px" }}>{String(value.value)}</Container>
    );
  } else {
    return (
      <Container>
        <div
          style={{
            fontFamily: "monospace",
            color: "red",
            fontSize: "small",
            fontWeight: 600,
            overflow: "scroll",
            height: "30px",
          }}
        >
          {value?.error}
        </div>
      </Container>
    );
  }
};
