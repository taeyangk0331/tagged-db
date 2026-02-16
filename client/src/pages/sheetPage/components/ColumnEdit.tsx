import CodeEditor from "@uiw/react-textarea-code-editor";
import {
  Column,
  COLUMN_TYPES,
  ColumnType,
  EnumColumn,
  FormulaColumn,
  FormulaType,
  SheetData,
  TagsColumn,
} from "@app/shared/types/sheet";
import {
  createDefaultEnum,
  validateColumnAction,
} from "@app/shared/sheetValidation";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ModalContainer } from "../../../components/ModalContainer";
import { ColumnEditAction, ColumnEditType } from "@app/shared/types/action";
import { popupAlert, popupConfirm } from "../../../utils/popup";
import { errorToString } from "@app/shared/util";
import {
  DEFAULT_FORMULA_TYPE,
  DEFAULT_FORMULAS,
  FORMULA_TYPE_EXPRESSION,
  FORMULA_TYPE_MODULE,
} from "@app/shared/formula";

// Style
const Container = styled.div`
  flex-grow: 1;
`;

const EditTable = styled.table`
  width: 100%;
`;

const ButtonRow = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

// Component

const COLUMN_TYPE_NAMES: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  enum: "Dropdown",
  tags: "Tags",
  date: "Date",
  formula: "Formula",
};

interface Prop {
  isOpen: boolean;
  onClose: () => void;

  columnId: string | null;
  sheetData: SheetData;
  onSubmit?: (actions: ColumnEditAction[]) => void;
  onDelete?: () => void;
}

type Actions = Partial<Record<ColumnEditType, ColumnEditAction | undefined>>;

export const ColumnEdit = ({
  columnId,
  sheetData,
  onSubmit,
  onDelete,
  isOpen,
  onClose,
}: Prop) => {
  const [column, setColumn] = useState<Column | undefined>(
    sheetData.columns.find((c) => c.id === columnId),
  );

  const actions = useRef<Actions>({});
  const currentColumnId = useRef<string | null>(null);

  useEffect(() => {
    if (columnId !== currentColumnId.current) {
      currentColumnId.current = columnId;
      setColumn(sheetData.columns.find((c) => c.id === columnId));
      actions.current = {};
    }
  }, [column, columnId, sheetData.columns]);

  const onCommitAction = useCallback(async () => {
    try {
      if (!column) return;

      const actionArr: ColumnEditAction[] = [];
      for (const key in actions.current) {
        const action = actions.current[key as ColumnEditType];
        if (!action) continue;
        const validate = validateColumnAction(action);
        if (!validate.ok) {
          await popupAlert(validate.error);
          return;
        }
        actionArr.push(action);
      }
      onSubmit?.(actionArr);
      actions.current = {};
    } catch (e) {
      popupAlert(errorToString(e));
    }
  }, [column, onSubmit]);

  if (!columnId) {
    return null;
  }

  if (!column) {
    return null;
  }

  let advancedEditEl = null;
  switch (column.type) {
    case "enum":
      advancedEditEl = <EnumAdvancedEdit column={column} actions={actions} />;
      break;
    case "tags":
      advancedEditEl = (
        <TagsAdvancedEdit
          sheetData={sheetData}
          column={column}
          actions={actions}
        />
      );
      break;
    case "formula":
      advancedEditEl = (
        <FormulaAdvancedEdit column={column} actions={actions} />
      );
      break;
    default:
      advancedEditEl = null;
      break;
  }

  return (
    <ModalContainer title={"Column Settings"} isOpen={isOpen} onClose={onClose}>
      <Container
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommitAction();
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <EditTable>
          <tbody>
            <EditRow label="Title">
              <input
                type="text"
                id="title"
                name="title"
                defaultValue={column.title}
                autoFocus
                onChange={(e) =>
                  (actions.current["rename"] = {
                    editType: "rename",
                    title: e.target.value,
                  })
                }
              />
            </EditRow>
            <EditRow label="Type">
              <select
                id="type"
                name="type"
                defaultValue={column.type}
                onChange={(e) => {
                  actions.current["change_type"] = {
                    editType: "change_type",
                    toType: e.target.value as ColumnType,
                  };
                  setColumn((c) =>
                    c
                      ? {
                          ...c,
                          type: e.target.value as ColumnType,
                        }
                      : undefined,
                  );
                }}
              >
                {COLUMN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {COLUMN_TYPE_NAMES[type]}
                  </option>
                ))}
              </select>
            </EditRow>
          </tbody>
        </EditTable>
        {advancedEditEl && <hr style={{ opacity: "50%" }} />}
        <div
          style={{
            maxHeight: "50vh",
            overflowY: "scroll",
          }}
        >
          <EditTable>
            <tbody>{advancedEditEl}</tbody>
          </EditTable>
        </div>
        <ButtonRow>
          <button onClick={onCommitAction}>Update</button>
          <button
            disabled={sheetData.columns.length === 1}
            onClick={async () => {
              if (
                await popupConfirm(
                  `Are you sure you want to delete column "${column.title}"?`,
                )
              ) {
                onDelete?.();
              }
            }}
          >
            Delete
          </button>
        </ButtonRow>
      </Container>
    </ModalContainer>
  );
};

// Sub Components
interface EditRowProps {
  children?: React.ReactNode;
  label: string;
  labelFor?: string;
}
const Td = styled.td`
  padding-top: 8px;
  font-size: small;
`;
const TdLabel = styled(Td)``;

const EditRow = ({ label, children, labelFor = "" }: EditRowProps) => {
  return (
    <tr>
      <TdLabel>
        <label htmlFor={labelFor}>{label}</label>
      </TdLabel>
      <Td>{children}</Td>
    </tr>
  );
};

// Sub Components - Advanced Edits
const EnumAdvancedEdit = (props: {
  column: EnumColumn;
  actions: RefObject<Actions>;
}) => {
  const { column, actions } = props;
  // Enum States
  const [enumState, setEnumState] = useState<{
    idOrder: string[];
    idToNames: Record<string, string>;
  }>({ idOrder: [], idToNames: {} });

  useEffect(() => {
    actions.current["enum_update"] = {
      editType: "enum_update",
      idOrder: enumState.idOrder,
      idToNames: enumState.idToNames,
    };
  }, [actions, enumState]);

  useEffect(() => {
    const enumIdMap: Record<string, string> = {};
    for (const option of column.options ?? []) {
      enumIdMap[option] = option;
    }
    setEnumState({ idOrder: column?.options || [], idToNames: enumIdMap });
  }, [column]);

  // Autoselect latest enum field
  const inputFieldsRef = useRef<HTMLInputElement[]>([]);
  const previousEnumCount = useRef(0);

  useEffect(() => {
    if (inputFieldsRef.current.length > previousEnumCount.current) {
      inputFieldsRef.current[inputFieldsRef.current.length - 1].select();
    }
    previousEnumCount.current = inputFieldsRef.current.length;
  }, [column.type, enumState]);

  // Callbacks
  const onEnumRenamed = (id: string, name: string) =>
    setEnumState((o) => ({
      ...o,
      idToNames: { ...o.idToNames, [id]: name },
    }));
  const onEnumMovedUp = (index: number) =>
    setEnumState((o) => {
      const copy = [...o.idOrder];
      [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
      return { ...o, idOrder: copy };
    });
  const onEnumMovedDown = (index: number) =>
    setEnumState((o) => {
      const copy = [...o.idOrder];
      [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]];
      return { ...o, idOrder: copy };
    });
  const onEnumDeleted = (id: string) =>
    setEnumState((o) => {
      const updatedOrder = o.idOrder.filter((i) => i !== id);
      const updatedMap = { ...o.idToNames };
      delete updatedMap[id];
      return {
        idOrder: updatedOrder,
        idToNames: updatedMap,
      };
    });
  const onEnumAdded = () => {
    setEnumState((o) => {
      const newName = createDefaultEnum(o.idOrder.map((e) => o.idToNames[e]));
      const id = crypto.randomUUID();
      return {
        idOrder: [...o.idOrder, id],
        idToNames: {
          ...o.idToNames,
          [id]: newName,
        },
      };
    });
  };
  return (
    <>
      {enumState.idOrder.map((id, index) => (
        <EditRow key={index} label={`Option ${index + 1}`}>
          <div
            style={{
              display: "flex",
              gap: 4,
            }}
          >
            <input
              ref={(ref) => {
                if (ref) inputFieldsRef.current[index] = ref;
              }}
              type="text"
              value={enumState.idToNames[id]}
              onChange={(e) => onEnumRenamed(id, e.target.value)}
            />
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onEnumMovedUp(index)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === enumState.idOrder.length - 1}
              onClick={() => onEnumMovedDown(index)}
            >
              ↓
            </button>
            <button type="button" onClick={() => onEnumDeleted(id)}>
              ×
            </button>
          </div>
        </EditRow>
      ))}
      <EditRow label="">
        <button type="button" onClick={() => onEnumAdded()}>
          + Add option
        </button>
      </EditRow>
    </>
  );
};

const TagsAdvancedEdit = (props: {
  sheetData: SheetData;
  column: TagsColumn;
  actions: RefObject<Actions>;
}) => {
  const { sheetData, column, actions } = props;

  const [currentTags, setCurrentTags] = useState<string[]>([]);

  useEffect(() => {
    setCurrentTags(sheetData.tagCache[column.id] ?? []);
  }, [sheetData.tagCache, column.id]);

  useEffect(() => {
    const cachedTags = sheetData.tagCache[column.id];
    if (!cachedTags) {
      actions.current["tag_rename"] = undefined;
      return;
    }

    const renameMap: Record<string, string> = {};
    for (let i = 0; i < cachedTags.length; i++) {
      if (cachedTags[i] === currentTags[i]) continue;
      renameMap[cachedTags[i]] = currentTags[i];
    }

    if (Object.keys(renameMap).length === 0) {
      actions.current["tag_rename"] = undefined;
      return;
    }
    actions.current["tag_rename"] = {
      editType: "tag_rename",
      tagMap: renameMap,
    };
  }, [actions, column.id, currentTags, sheetData.tagCache]);

  return (
    <>
      {currentTags.map((tag, index) => (
        <EditRow key={index} label={`Tag ${index + 1}`}>
          <div
            style={{
              display: "flex",
              gap: 4,
            }}
          >
            <input
              type="text"
              value={tag}
              placeholder={sheetData.tagCache[column.id]?.[index] ?? ""}
              onChange={(e) =>
                setCurrentTags((tags) => {
                  const copy = [...tags];
                  copy[index] = e.target.value;
                  return copy;
                })
              }
            />
          </div>
        </EditRow>
      ))}
    </>
  );
};

const FormulaAdvancedEdit = (props: {
  column: FormulaColumn;
  actions: RefObject<Actions>;
}) => {
  const { column, actions } = props;

  const [editedFormula, setEditedFormula] = useState<string>(
    column.formula ??
      DEFAULT_FORMULAS[column.formulaType ?? DEFAULT_FORMULA_TYPE],
  );
  const [editedFormulaType, setEditedFormulaType] = useState<FormulaType>(
    column.formulaType ?? DEFAULT_FORMULA_TYPE,
  );
  const formulasCacheMap = useRef<Record<FormulaType, string>>({
    ...DEFAULT_FORMULAS,
  });

  // On first load
  useEffect(() => {
    formulasCacheMap.current = DEFAULT_FORMULAS;
    formulasCacheMap.current[column.formulaType ?? DEFAULT_FORMULA_TYPE] =
      column.formula ?? "";
  }, [column]);

  // Dep
  useEffect(() => {
    if (editedFormula === "") return;
    actions.current["formula"] = {
      editType: "formula",
      formula: editedFormula,
      formulaType: editedFormulaType,
    };
  }, [actions, column.formula, editedFormula, editedFormulaType]);

  const onFormulaChange = (updatedFormula: string) => {
    formulasCacheMap.current[editedFormulaType] = updatedFormula;
    setEditedFormula(updatedFormula);
  };

  const onFormulaTypeChange = (updatedFormulaType: FormulaType) => {
    if (updatedFormulaType === editedFormulaType) return;

    setEditedFormula(formulasCacheMap.current[updatedFormulaType]);
    setEditedFormulaType(updatedFormulaType);
  };

  return (
    <>
      <EditRow label={`Formula:`}>
        <CodeEditor
          language="python"
          style={{
            width: "500px",
            height: "300px",
            fontFamily: "monospace",
            fontWeight: 700,
            backgroundColor: "#f3f3f3",
          }}
          data-color-mode="light"
          value={editedFormula}
          onChange={(e) => onFormulaChange(e.target.value)}
          placeholder={DEFAULT_FORMULAS[editedFormulaType]}
        />
      </EditRow>
      <EditRow label="Advanced:" labelFor="formula-type-module">
        <input
          id="formula-type-module"
          type="checkbox"
          onChange={(e) => {
            if (e.target.checked) {
              onFormulaTypeChange(FORMULA_TYPE_MODULE);
            } else {
              onFormulaTypeChange(FORMULA_TYPE_EXPRESSION);
            }
          }}
        />
      </EditRow>
    </>
  );
};
