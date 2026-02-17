import { Column, ColumnValue, Row, SheetData } from "@app/shared/types/sheet";
import * as migrator from "@app/shared/sheetMigration";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Cell } from "./components/Cell";
import { Table, Th, Thead, Tbody, HEADER_HEIGHT, Td } from "./components/Table";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { IoIosAdd } from "react-icons/io";
import { HeaderCell } from "./components/HeaderCell";
import { ColumnEdit } from "./components/ColumnEdit";
import { BasicButton } from "../../components/BasicButton";
import { EditButton } from "../../components/EditButton";
import { ColumnEditAction, SheetAction } from "@app/shared/types/action";
import { useStorageBackend } from "../../hooks/useBackend";
import { COLORS } from "../../styles/colors";

import { border } from "../../styles/mixins";
import { DesktopHeader } from "../../components/desktop/DesktopHeader";
import { BaseButton } from "../../components/BaseButton";
import { parseTags } from "@app/shared/sheetValidation";
import { useDraggableWindow } from "../../hooks/useDraggableWindow";
import { WindowHeader } from "../../components/desktop/WindowHeader";
import { FaFileCsv } from "react-icons/fa6";
import { popupAlert, popupConfirm } from "../../utils/popup";
import {
  ComputedSheet,
  computeSheetValues,
  injectComputedValues,
  RowWithComputed,
} from "../../utils/formulaComputation";

const MAX_HEIGHT_OFFSET = 40;
const TABLE_TOP_MASK_HEIGHT = 8;
const DEFAULT_POSITION = { x: 48, y: 52 };
const MIN_TOP = 36; // 36 number came from header height
const OVERFLOW_INITIAL_POSITION = { x: 0, y: MIN_TOP };

// Styles
const Background = styled.div`
  position: absolute;
  inset: 0;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  box-sizing: border-box;

  background-color: ${COLORS.DESKTOP};
`;

// max-height : sets as upper height limit to not overflow the sheetPage
const MainContainer = styled.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-sizing: border-box;

  padding: 6px;
  color: black;
  background-color: ${COLORS.PANEL};
  ${border({})};

  width: fit-content;
  max-width: 100%;
  max-height: calc(100vh - ${MAX_HEIGHT_OFFSET}px);
`;

const VContainer = styled.div`
  --table-top-mask-height: ${TABLE_TOP_MASK_HEIGHT}px;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: auto;

  border-top: 2px solid grey;
  border-left: 2px solid grey;
  background-color: white;
  padding: 0 8px 8px;
  /* flex-grow: 1; */
`;

const TableTopMask = styled.div`
  position: sticky;
  top: 0;
  height: var(--table-top-mask-height);
  background-color: white;
  flex-shrink: 0;
`;

const VSep = styled.div`
  margin: 0;
  width: 1px;
  height: 80%;
  background-color: ${COLORS.DARK};
  border-right: 1px solid white;
`;

// - Right column container
const AddColumnTh = styled(Th)`
  padding: 2px;
  height: ${HEADER_HEIGHT}px;
`;

const AddColumnButton = styled(BasicButton)`
  width: 100%;
  height: 100%;
  margin: auto;
  border: 2px dotted #0000006f;
`;

const DelRowContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

// - Column Button
const AddContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px dotted #0000006f;
`;

const AddRowContainer = styled(AddContainer)`
  height: ${HEADER_HEIGHT}px;
`;

const AddRowButton = styled(AddColumnButton)`
  height: ${HEADER_HEIGHT}px;
  width: 100%;
`;

// Component Page
interface SortKey {
  columnId: string;
  ascOrder: boolean;
}

export const SheetPage = () => {
  const { storageBackend: storageBackend } = useStorageBackend();
  const {
    containerRef,
    isDragging,
    dragHandleProps,
    windowStyle,
    setWindowPosition,
  } = useDraggableWindow({
    initialPosition: DEFAULT_POSITION,
    minTop: MIN_TOP,
  });
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const initialPositionResolvedRef = useRef(false);
  const sheetId = useParams<{ id: string }>().id ?? "";
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [computedCells, setComputedCells] = useState<ComputedSheet>({});
  const [isWindowReady, setIsWindowReady] = useState(false);
  const [currentEditColumnId, setCurrentEditColumnId] = useState<string | null>(
    null,
  );

  const [sortby, setSortby] = useState<SortKey | null>(null);
  const [filterKeys, setFilterKeys] = useState<Record<string, string[]>>({}); // colid ->tags

  useEffect(() => {
    if (sheetData) {
      document.title = sheetData.name + " | MyTaggedDB";
    } else {
      document.title = "Loading... | MyTaggedDB";
    }
  }, [sheetData]);

  const loadSheet = useCallback(async () => {
    const res = await storageBackend.getSheetData(sheetId);
    if (res.ok) {
      setSheetData(res.value);
    } else {
      await popupAlert(res.error);

      await new Promise((resolve) => setTimeout(resolve, 100));
      window.location.href = "/";
    }
  }, [sheetId, storageBackend]);

  // Initial load
  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  // Computed cells
  useEffect(() => {
    if (!sheetData) {
      return;
    }
    computeSheetValues(sheetData).then(setComputedCells);
  }, [sheetData]);

  const onUpdateCell = useCallback(
    async (rowId: string, column: Column, value: ColumnValue) => {
      if (sheetData === null) {
        return;
      }
      const action: SheetAction = {
        action: "update_cell",
        params: {
          rowId,
          columnId: column.id,
          value,
        },
      };
      const rowsResult = migrator.reduce(sheetData, action);
      if (!rowsResult.ok) {
        await popupAlert(rowsResult.error);
        return;
      }
      setSheetData(rowsResult.value);

      storageBackend.updateSheet(sheetId, action).then(async (res) => {
        if (!res.ok) {
          await popupAlert(res.error);
          loadSheet();
        }
      });
    },
    [loadSheet, sheetData, sheetId, storageBackend],
  );

  const rows: RowWithComputed[] = useMemo(() => {
    if (!sheetData) return [];

    const rows: RowWithComputed[] = injectComputedValues(
      sheetData.rows,
      computedCells,
    );
    rows.sort((a, b) => {
      if (!sortby) return 0;
      const aVal = a.values[sortby.columnId] || "";
      const bVal = b.values[sortby.columnId] || "";
      const aEmpty = aVal === "";
      const bEmpty = bVal === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (sortby.ascOrder) {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });

    return rows.filter((row) => {
      for (const [colId, tags] of Object.entries(filterKeys)) {
        const rowTagsString = row.values[colId] || "";
        const rowTags = parseTags(rowTagsString);
        for (const tag of tags) {
          if (!rowTags.includes(tag)) {
            return false;
          }
        }
      }
      return true;
    });
  }, [computedCells, filterKeys, sheetData, sortby]);

  // SheetPage only: the table container can expand with rows/columns on load,
  // so we resolve the initial draggable position in a layout effect before paint.
  // MySheetsPage uses a fixed-size container and does not need this step.
  useLayoutEffect(() => {
    if (initialPositionResolvedRef.current) {
      return;
    }

    const tableViewport = tableViewportRef.current;
    if (!tableViewport) {
      return;
    }

    const hasWidthOverflow =
      tableViewport.scrollWidth > tableViewport.clientWidth;
    const hasHeightOverflow =
      tableViewport.scrollHeight > tableViewport.clientHeight;

    setWindowPosition(
      hasWidthOverflow || hasHeightOverflow
        ? OVERFLOW_INITIAL_POSITION
        : DEFAULT_POSITION,
    );

    initialPositionResolvedRef.current = true;
    setIsWindowReady(true);
  }, [setWindowPosition, sheetData]);

  useEffect(() => {
    const tableViewport = tableViewportRef.current;
    if (!tableViewport) {
      return;
    }

    const hasWidthOverflow =
      tableViewport.scrollWidth > tableViewport.clientWidth;
    const hasHeightOverflow =
      tableViewport.scrollHeight > tableViewport.clientHeight;

    if (hasWidthOverflow || hasHeightOverflow) {
      setWindowPosition((current) => ({
        x: hasWidthOverflow ? 0 : current.x,
        y: hasHeightOverflow ? 0 : current.y,
      }));
    }
  }, [setWindowPosition, sheetData?.columns.length, sheetData?.rows.length]);

  if (!sheetData) return null;

  const onUpdateColumn = async (
    columnId: string,
    actions: ColumnEditAction[],
  ) => {
    if (actions.length === 0) {
      return;
    }

    const action: SheetAction = {
      action: "update_column_batched",
      params: {
        columnId,
        actions,
      },
    };
    const updatedSheetData = migrator.reduce(sheetData, action);
    if (!updatedSheetData.ok) {
      await popupAlert(updatedSheetData.error);
      return;
    }
    setSheetData(updatedSheetData.value);

    storageBackend.updateSheet(sheetId, action).then(async (res) => {
      if (!res.ok) {
        await popupAlert(res.error);
        loadSheet();
      }
    });
  };

  const onDeleteColumn = async (columnId: string) => {
    const action: SheetAction = {
      action: "delete_column",
      params: {
        columnId,
      },
    };
    const updatedRes = migrator.reduce(sheetData, action);
    if (!updatedRes.ok) {
      await popupAlert("Failed to delete column: " + updatedRes.error);
      return;
    }
    setSheetData(updatedRes.value);
    storageBackend.updateSheet(sheetId, action).then(async (res) => {
      if (!res.ok) {
        await popupAlert(
          "[Server Error] Failed to delete column: " + res.error,
        );
        loadSheet();
      }
    });
  };

  const onAddColumn = async () => {
    const action: SheetAction = {
      action: "add_column",
      params: {
        title: "Untitled column",
        type: "text",
        columnId: crypto.randomUUID(),
      },
    };

    const updateRes = migrator.reduce(sheetData, action);
    if (!updateRes.ok) {
      await popupAlert("Failed to create column: " + updateRes.error);
      return;
    }
    setSheetData(updateRes.value);
    const res = await storageBackend.updateSheet(sheetId, action);
    if (!res.ok) {
      await popupAlert("[Server Error] Failed to create column: " + res.error);
      loadSheet();
    }
  };

  const onAddRow = async () => {
    const action: SheetAction = {
      action: "add_row",
      params: {
        rowId: crypto.randomUUID(),
      },
    };
    const updatedRes = migrator.reduce(sheetData, action);
    if (!updatedRes.ok) {
      await popupAlert("Failed to create row: " + updatedRes.error);
      return;
    }
    setSheetData(updatedRes.value);
    storageBackend.updateSheet(sheetId, action).then(async (res) => {
      if (!res.ok) {
        await popupAlert("[Server Error] Failed to create row: " + res.error);
        loadSheet();
      }
    });
  };

  const onDeleteRow = async (rowId: string) => {
    if (!(await popupConfirm("Are you sure you want to delete this row?"))) {
      return;
    }
    const action: SheetAction = {
      action: "delete_row",
      params: {
        rowId,
      },
    };
    const updatedRes = migrator.reduce(sheetData, action);
    if (!updatedRes.ok) {
      await popupAlert("Failed to delete row: " + updatedRes.error);
      return;
    }
    setSheetData(updatedRes.value);
    storageBackend.updateSheet(sheetId, action).then(async (res) => {
      if (!res.ok) {
        await popupAlert("[Server Error] Failed to delete row: " + res.error);
        loadSheet();
      }
    });
  };

  // Context panel
  const ContextPanel = () => {
    const contextPanelItems: React.ReactNode[] = [];
    if (sortby) {
      contextPanelItems.push(
        <BaseButton onClick={() => setSortby(null)} title="Clear sort">
          <span style={{ opacity: 0.7 }}>Sort: </span>
          <span>
            {sheetData.columns.find((c) => c.id === sortby.columnId)?.title +
              " " +
              (sortby.ascOrder ? "↑" : "↓")}
          </span>
        </BaseButton>,
      );
    }
    if (Object.keys(filterKeys).length > 0) {
      if (contextPanelItems.length > 0) {
        contextPanelItems.push(<VSep />);
      }

      contextPanelItems.push(
        <BaseButton onClick={() => setFilterKeys({})}>
          <span style={{ opacity: 0.7 }}>Filter: </span>
          <span>
            {Object.entries(filterKeys).map(([key, value]) => {
              const column = sheetData.columns.find((c) => c.id === key);
              return (
                <span key={key}>
                  {column?.title}: {value.join(",")}
                </span>
              );
            })}
          </span>
        </BaseButton>,
      );
    }

    return (
      <div
        style={{
          padding: "4px",
          color: COLORS.GREY,
          fontSize: "smaller",
          fontWeight: 600,
          display: "flex",
          justifyContent: "start",
          alignItems: "center",
          height: "24px",
          gap: "16px",
        }}
      >
        {contextPanelItems}
      </div>
    );
  };

  return (
    <Background>
      <DesktopHeader />
      <MainContainer
        ref={containerRef}
        style={{
          ...windowStyle,
          visibility: isWindowReady ? "visible" : "hidden",
        }}
      >
        <WindowHeader
          showCloseButton
          onClose={() =>
            (window.location.href = "/?" + storageBackend.queryParam)
          }
          closeToolTip={`Close "${sheetData.name}"`}
          isDragging={isDragging}
          dragHandleProps={dragHandleProps}
        >
          <FaFileCsv style={{ width: "16px", height: "16px" }} />
          {sheetData.name}.csv
          {storageBackend.backendType === "api" && (
            <div
              style={{ fontSize: "smaller,", fontWeight: 800, opacity: 0.7 }}
            >
              {` | ${storageBackend.url}`}
            </div>
          )}
        </WindowHeader>

        {/* Context panel */}
        {<ContextPanel />}

        <VContainer ref={tableViewportRef}>
          <TableTopMask />
          {/* Table */}
          <Table style={{ flexGrow: 1 }}>
            <Thead>
              <tr>
                <Th
                  style={{
                    textAlign: "center",
                    fontSize: "larger",
                    fontWeight: 700,
                  }}
                >
                  <EditButton
                    onClick={() => setSortby(null)}
                    style={{ color: COLORS.HEADER_TITLE }}
                  >
                    #
                  </EditButton>
                </Th>
                {sheetData?.columns.map((column, ind) => (
                  <Th key={column.id}>
                    <HeaderCell
                      underline={sortby?.columnId === column.id}
                      onClick={() => {
                        if (sortby && sortby.columnId === column.id) {
                          if (sortby.ascOrder) {
                            setSortby({
                              columnId: column.id,
                              ascOrder: false,
                            });
                          } else if (!sortby.ascOrder) {
                            setSortby(null);
                          }
                        } else {
                          setSortby({
                            columnId: column.id,
                            ascOrder: true,
                          });
                        }
                      }}
                      title={column.title}
                      onEdit={() => {
                        setCurrentEditColumnId(column.id);
                      }}
                      index={ind}
                      total={sheetData.columns.length}
                      onLeft={() =>
                        onUpdateColumn(column.id, [
                          {
                            editType: "reorder",
                            toIndex: ind - 1,
                          },
                        ])
                      }
                      onRight={() =>
                        onUpdateColumn(column.id, [
                          {
                            editType: "reorder",
                            toIndex: ind + 1,
                          },
                        ])
                      }
                    />
                  </Th>
                ))}
                <AddColumnTh>
                  <AddColumnButton onClick={onAddColumn} title="Add Column">
                    <IoIosAdd />
                  </AddColumnButton>
                </AddColumnTh>
              </tr>
            </Thead>
            <Tbody>
              {/* Rows */}
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td id="#" style={{ textAlign: "center", color: "#353535" }}>
                    {sheetData.rows.indexOf(
                      sheetData.rows.find((r) => r.id === row.id) as Row,
                    ) + 1}
                  </Td>
                  {sheetData.columns.map((column) => (
                    <Cell
                      rowId={row.id}
                      key={column.id}
                      value={row.values[column.id]}
                      formulaValue={row.formulaValues[column.id]}
                      columnInfo={column}
                      onCellUpdate={onUpdateCell}
                      tagSuggestions={sheetData.tagCache[column.id]}
                      onTagClicked={(tag, e) => {
                        if (e.shiftKey) {
                          if (filterKeys[column.id]?.includes(tag)) {
                            return;
                          }

                          setFilterKeys((e) => ({
                            ...e,
                            [column.id]: [...(e[column.id] || []), tag],
                          }));
                        } else {
                          setFilterKeys({ [column.id]: [tag] });
                        }
                      }}
                    />
                  ))}

                  <Td key="_del">
                    <DelRowContainer onClick={() => onDeleteRow(row.id)}>
                      <EditButton>del</EditButton>
                    </DelRowContainer>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>

          {sheetData.columns.length !== 0 && (
            <AddRowContainer>
              <AddRowButton onClick={onAddRow} title="Add row">
                <IoIosAdd />
              </AddRowButton>
            </AddRowContainer>
          )}
        </VContainer>

        {/* Modals */}
        <ColumnEdit
          key={currentEditColumnId} // force state reset
          isOpen={!!currentEditColumnId}
          onClose={() => setCurrentEditColumnId(null)}
          columnId={currentEditColumnId}
          sheetData={sheetData}
          onSubmit={(actions) => {
            if (!currentEditColumnId) {
              return;
            }
            onUpdateColumn(currentEditColumnId, actions);
            setCurrentEditColumnId(null);
          }}
          onDelete={() => {
            if (!currentEditColumnId) {
              return;
            }
            onDeleteColumn(currentEditColumnId);
            setCurrentEditColumnId(null);
          }}
        />
      </MainContainer>
    </Background>
  );
};
