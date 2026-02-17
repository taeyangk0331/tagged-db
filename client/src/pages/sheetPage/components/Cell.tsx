import { Column, ColumnValue } from "@app/shared/types/sheet";
import React, { useCallback, useMemo } from "react";
import { Td } from "./Table";
import { TextEdit } from "./cellEdit/TextEdit";
import { NumberEdit } from "./cellEdit/NumberEdit";
import { EnumEdit } from "./cellEdit/EnumEdit";
import { TagEdit } from "./cellEdit/TagEdit";
import { DateEdit } from "./cellEdit/DateEdit";
import { FormulaEdit } from "./cellEdit/FormulaEdit";
import { ComputedValue } from "../../../utils/formulaComputation";

interface Prop {
  rowId: string;
  columnInfo: Column;
  value?: ColumnValue;
  formulaValue?: ComputedValue;
  tagSuggestions?: string[];
  onTagClicked: (tag: string, e: React.MouseEvent) => void;

  onCellUpdate?: (rowId: string, column: Column, value: ColumnValue) => void;
}

export const Cell = React.memo(
  ({
    rowId,
    columnInfo,
    value,
    formulaValue,
    onCellUpdate,
    tagSuggestions,
    onTagClicked,
  }: Prop) => {
    const onChanged = useCallback(
      (updatedValue: ColumnValue) => {
        onCellUpdate?.(rowId, columnInfo, updatedValue);
      },
      [onCellUpdate, rowId, columnInfo],
    );

    const EditComponent = useMemo(() => {
      switch (columnInfo.type) {
        case "text":
          return <TextEdit value={value} onChange={onChanged} />;
        case "number":
          return <NumberEdit value={value} onChange={onChanged} />;
        case "enum":
          return (
            <EnumEdit
              value={value}
              onChange={onChanged}
              options={columnInfo.options}
            />
          );
        case "tags":
          return (
            <TagEdit
              rowId={rowId}
              columnId={columnInfo.id}
              value={value}
              onChange={onChanged}
              tags={tagSuggestions ?? []}
              onTagClicked={onTagClicked}
            />
          );
        case "date":
          return <DateEdit value={value} onChange={onChanged} />;
        case "formula":
          return <FormulaEdit value={formulaValue} />;
      }
    }, [
      columnInfo,
      formulaValue,
      onChanged,
      onTagClicked,
      rowId,
      tagSuggestions,
      value,
    ]);

    return <Td>{EditComponent}</Td>;
  },
);
