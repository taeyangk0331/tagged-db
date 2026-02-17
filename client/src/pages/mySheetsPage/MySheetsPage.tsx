import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { FaFileCsv } from "react-icons/fa6";
import { PiFoldersLight } from "react-icons/pi";
import { BasicButton } from "../../components/BasicButton";
import { useUserRemotes } from "../../hooks/useUserRemotes";
import { IoMdClose, IoMdAdd } from "react-icons/io";
import { PiNetworkBold as IconLocal } from "react-icons/pi";
import {
  TbNetwork as IconNetwork,
  TbNetworkOff as IconNetworkOff,
  TbHourglass as IconProgress,
} from "react-icons/tb";
import { useStorageBackend } from "../../hooks/useBackend";
import { localStorageBackend } from "../../storageBackends/localStorageBackend";
import { COLORS } from "../../styles/colors";
import { border } from "../../styles/mixins";
import { DesktopHeader } from "../../components/desktop/DesktopHeader";
import { useDraggableWindow } from "../../hooks/useDraggableWindow";
import { exportCsv, importCsv } from "../../utils/csvUtil";
import type { SheetMeta } from "@app/shared/types/sheet";
import { WindowHeader } from "../../components/desktop/WindowHeader";
import { popupAlert, popupConfirm, popupPrompt } from "../../utils/popup";
import { sanitizeTitle } from "@app/shared/sheetValidation";
import { handshake } from "../../storageBackends/apiBackend";

const WINDOW_SIZE_RATIO = 0.8;
const INITIAL_POSITION_RATIO = (1.0 - WINDOW_SIZE_RATIO) * 0.5;
const INITIAL_POSITION_FALLBACK = 40;
const MAX_HEIGHT_OFFSET = 40;

const Background = styled.div`
  position: absolute;
  inset: 0;
  height: 100vh;
  width: 100vw;
  overflow: hidden;

  background-color: ${COLORS.DESKTOP};
`;

const FolderContainer = styled.div`
  position: absolute;
  padding: 6px;
  color: black;
  background-color: ${COLORS.PANEL};
  height: ${WINDOW_SIZE_RATIO * 100}%;
  width: ${WINDOW_SIZE_RATIO * 100}%;
  max-height: calc(100vh - ${MAX_HEIGHT_OFFSET}px);
  max-width: calc(100vw - 4px);
  ${border({})}
  display: flex;
  flex-direction: column;
  outline: none;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`;

const MenuButton = styled(BasicButton)`
  padding: 4px;
`;

const HSep = styled.div`
  margin: 4px 0;
  width: 100%;
  height: 1px;
  background-color: ${COLORS.DARK};
  border-bottom: 1px solid white;
`;

const VSep = styled.div`
  margin: 0;
  width: 1px;
  height: 80%;
  background-color: ${COLORS.DARK};
  border-right: 1px solid white;
`;

const TabsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0px;
  background-color: ${COLORS.PANEL};
  padding: 0;
  overflow-y: scroll;
  flex-shrink: 0;
`;

const TabButton = styled.a<{ $selected: boolean; $loading?: boolean }>`
  margin-top: 4px;
  padding: 4px 12px;
  min-height: 24px;
  padding-bottom: ${({ $selected }) => ($selected ? 8 : 4)}px;
  color: ${({ $selected }) => ($selected ? "black" : "#000000a2")};
  font-weight: ${({ $selected }) => ($selected ? 600 : 500)};

  border-top-right-radius: 5px;
  border-top-left-radius: 5px;

  position: relative;
  z-index: ${({ $selected }) => ($selected ? 10 : 0)};

  ${border({ thickness: 2 })};
  border-bottom: ${({ $selected }) =>
    $selected ? "2px solid #c4c4c4" : "none"};

  cursor: ${({ $loading }) => ($loading ? "wait" : "pointer")};
  /* user-select: none; */
`;

const FilesContainerOutline = styled.div`
  display: flex;
  flex-direction: column;
  background-color: #c4c4c4;
  padding: 8px;
  flex-grow: 1;

  position: relative;
  z-index: 5;
  margin-top: -2px;
  min-height: 0px;

  ${border({ thickness: 2 })};
`;

const FilesContainer = styled.div`
  color: black;
  background-color: white;
  padding: 8px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;

  overflow-y: scroll;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  padding: 4px 8px;
  font-weight: bold;
  border-bottom: 1px solid #00000033;

  & > div:nth-child(2),
  & > div:nth-child(3) {
    text-align: right;
  }
`;

interface FileProps {
  $selected?: boolean;
}

const File = styled.a<FileProps>`
  color: inherit;
  text-decoration: none;
  height: 48px;
  min-height: 48px;
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  align-items: center;
  padding: 0 8px;
  background: ${({ $selected }) => ($selected ? "#00000045" : "transparent")};
  border: 1px solid #00000000;

  &:hover {
    border: 1px solid #00000033;
    text-decoration: ${({ $selected }) =>
      $selected ? "underline" : "inherit"};
    cursor: pointer;
  }

  & > div:nth-child(2),
  & > div:nth-child(3) {
    text-align: right;
  }
`;

const FileCreating = styled.div`
  color: grey;
  font-size: small;
  height: 24px;
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  align-items: center;
  padding: 0 8px;
`;

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

// Component

export const MySheetsPage = () => {
  const userRemotes = useUserRemotes();
  const { containerRef, dragHandleProps, isDragging, windowStyle } =
    useDraggableWindow({
      initialPosition: {
        x:
          typeof window === "undefined"
            ? INITIAL_POSITION_FALLBACK
            : Math.round(window.innerWidth * INITIAL_POSITION_RATIO),
        y:
          typeof window === "undefined"
            ? INITIAL_POSITION_FALLBACK
            : Math.max(
                34,
                Math.round(window.innerHeight * INITIAL_POSITION_RATIO),
              ),
      },
      minTop: 34,
    });

  const {
    storageBackend: storageBackend,
    setUseLocalStorage,
    setUseRemoteBackend,
  } = useStorageBackend();
  const [addingStorage, setAddingStorage] = useState<boolean>(false);
  const [loadingStorages, setLoadingStorages] = useState<string[]>([]);
  const [brokenStorages, setBrokenStorages] = useState<string[]>([]);

  const [sheetsMap, setSheetsMap] = useState<
    Partial<Record<string, SheetMeta[]>>
  >({});
  const sheets = useMemo(
    () => sheetsMap[storageBackend.id],
    [sheetsMap, storageBackend.id],
  );
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [creatingSheetMap, setCreatingSheetMap] = useState<
    Partial<Record<string, string>>
  >({});
  const [importingSheetMap, setImportingSheetMap] = useState<
    Partial<Record<string, string>>
  >({});
  const creatingSheet = useMemo(
    () => creatingSheetMap[storageBackend.id],
    [creatingSheetMap, storageBackend.id],
  );
  const importingSheet = useMemo(
    () => importingSheetMap[storageBackend.id],
    [importingSheetMap, storageBackend.id],
  );
  const isCurrentStorageUnavailable =
    brokenStorages.includes(storageBackend.id) ||
    loadingStorages.includes(storageBackend.id);
  const isImportDisabled =
    !!creatingSheet || !!importingSheet || isCurrentStorageUnavailable;

  const fetchSheets = useCallback(
    async (preserveSelection = false) => {
      if (
        storageBackend.backendType === "api" &&
        !userRemotes.remotes.find((b) => b.url === storageBackend.url)
      ) {
        // Attempting to open remote tab that doesn't exist
        setUseLocalStorage();
        return;
      }

      setLoadingStorages((s) => [...s, storageBackend.id]);
      setBrokenStorages((s) => s.filter((s) => s !== storageBackend.id));

      const res = await storageBackend.getSheets();

      setLoadingStorages((s) => s.filter((s) => s !== storageBackend.id));
      if (res.ok) {
        setSheetsMap((m) => ({ ...m, [storageBackend.id]: res.value }));
        if (!preserveSelection) {
          setSelectedSheet("");
        }
      } else if (userRemotes.remotes.find((b) => b.url === storageBackend.id)) {
        setBrokenStorages((s) => [...s, storageBackend.id]);
        await new Promise((resolve) => setTimeout(resolve, 50));
        console.error(
          `Could not connect to remote: ${storageBackend.id}.\n\nReason: ${res.error}`,
        );
      }
    },
    [setUseLocalStorage, storageBackend, userRemotes.remotes],
  );

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  const onCreateSheet = useCallback(async () => {
    const title = sanitizeTitle(
      (await popupPrompt("Enter sheet title", "Create sheet")) ?? "",
    );
    if (!title) return;

    if (sheets?.find((sheet) => sheet.name === title)) {
      await popupAlert(`Error: Sheet "${title}" already exists!`);
      return;
    }

    setCreatingSheetMap((s) => ({ ...s, [storageBackend.id]: title }));
    storageBackend.createSheet(title).then(async (res) => {
      setCreatingSheetMap((s) => ({ ...s, [storageBackend.id]: undefined }));
      if (res.ok) {
        setSheetsMap((m) => {
          const storageSheets = m[storageBackend.id] || [];
          return {
            ...m,
            [storageBackend.id]: [...storageSheets, res.value],
          };
        });
      } else {
        await popupAlert(res.error);
        fetchSheets();
      }
    });
  }, [fetchSheets, sheets, storageBackend]);

  const onRenameSheet = useCallback(async () => {
    if (!selectedSheet) {
      return;
    }

    const sheet = sheets?.find((sheet) => sheet.id === selectedSheet);
    if (!sheet) {
      popupAlert("Sheet not found");
      return;
    }
    const title = sanitizeTitle(
      (await popupPrompt(
        `Enter new sheet title`,
        "Rename sheet",
        sheet.name,
      )) ?? "",
    );
    if (!title) {
      return;
    }
    if (
      sheets?.find(
        (sheet) => sheet.name === title && sheet.id !== selectedSheet,
      )
    ) {
      await popupAlert(`Error: Sheet "${title}" already exists!`);
      return;
    }
    sheet.name = title;
    setSheetsMap((s) => ({ ...s }));

    storageBackend.renameSheet(selectedSheet, title).then(async (res) => {
      if (!res.ok) {
        await popupAlert(res.error);
        fetchSheets();
      }
    });
  }, [selectedSheet, sheets, storageBackend, fetchSheets]);

  const onDeleteSheet = useCallback(async () => {
    if (!selectedSheet) {
      return;
    }

    const sheet = sheets?.find((sheet) => sheet.id === selectedSheet);
    if (!sheet) {
      await popupAlert("Sheet not found");
      return;
    }

    if (
      await popupConfirm(`Are you sure you want to delete "${sheet.name}"?`)
    ) {
      setSheetsMap((s) => {
        const storageSheets = s[storageBackend.id] || [];
        return {
          ...s,
          [storageBackend.id]: storageSheets.filter(
            (s) => s.id !== selectedSheet,
          ),
        };
      });

      storageBackend.deleteSheet(selectedSheet).then(async (res) => {
        if (!res.ok) {
          await popupAlert(res.error);
          fetchSheets();
        }
      });
    }
  }, [selectedSheet, sheets, storageBackend, fetchSheets]);

  // Exporting/Importing function
  const onExportSheet = useCallback(async () => {
    if (!selectedSheet) {
      return;
    }

    const sheetDataRes = await storageBackend.getSheetData(selectedSheet);
    if (!sheetDataRes.ok) {
      alert(sheetDataRes.error);
      return;
    }
    exportCsv(sheetDataRes.value);
  }, [selectedSheet, storageBackend]);

  const onImportSheet = useCallback(async () => {
    if (isImportDisabled) {
      return;
    }
    const csvRes = await importCsv(sheetsMap[storageBackend.id] || []);
    if (!csvRes.ok) {
      alert("Failed to parse CSV: " + csvRes.error);
      return;
    }

    const importedSheet = csvRes.value;
    setImportingSheetMap((state) => ({
      ...state,
      [storageBackend.id]: importedSheet.name || "Imported Sheet",
    }));

    try {
      const importRes = await storageBackend.importSheet(importedSheet);
      if (!importRes.ok) {
        alert(importRes.error);
        await fetchSheets();
        return;
      }

      setSheetsMap((map) => {
        const storageSheets = map[storageBackend.id] || [];
        return {
          ...map,
          [storageBackend.id]: [...storageSheets, importedSheet],
        };
      });
      setSelectedSheet(importedSheet.id);
      await fetchSheets(true);
    } finally {
      setImportingSheetMap((state) => ({
        ...state,
        [storageBackend.id]: undefined,
      }));
    }
  }, [fetchSheets, isImportDisabled, sheetsMap, storageBackend]);

  const getUrl = useCallback(() => {
    let url = `/sheet/${selectedSheet}`;
    if (storageBackend.queryParam) {
      url += `?${storageBackend.queryParam}`;
    }
    return url;
  }, [selectedSheet, storageBackend]);

  const onOpenSheet = useCallback(() => {
    if (!selectedSheet) {
      return;
    }
    window.open(getUrl());
  }, [getUrl, selectedSheet]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [containerRef]);

  return (
    <Background onClick={() => setSelectedSheet("")}>
      <DesktopHeader />
      <FolderContainer
        tabIndex={-1}
        ref={containerRef}
        style={windowStyle}
        onClick={(event) => event.stopPropagation()}
        onKeyUp={(e) => {
          if (e.ctrlKey) {
            return;
          }

          if (e.key === "Escape") {
            setSelectedSheet("");
          } else if (e.key === "n") {
            onCreateSheet();
          } else if (e.key === "r") {
            onRenameSheet();
          } else if (e.key === "d") {
            onDeleteSheet();
          } else if (e.key === "o") {
            onOpenSheet();
          } else if (e.key === "i") {
            onImportSheet();
          } else if (e.key === "x") {
            onExportSheet();
          }
        }}
      >
        <WindowHeader isDragging={isDragging} dragHandleProps={dragHandleProps}>
          <PiFoldersLight /> My Sheets{" "}
        </WindowHeader>
        <ButtonContainer>
          <MenuButton
            onClick={onCreateSheet}
            disabled={!!creatingSheet || isCurrentStorageUnavailable}
          >
            <u>N</u>ew
          </MenuButton>
          <MenuButton onClick={onImportSheet} disabled={isImportDisabled}>
            <u>I</u>mport
          </MenuButton>
          <VSep />
          <MenuButton onClick={onOpenSheet} disabled={!selectedSheet}>
            <u>O</u>pen
          </MenuButton>
          <MenuButton onClick={onRenameSheet} disabled={!selectedSheet}>
            <u>R</u>ename
          </MenuButton>
          <MenuButton onClick={onDeleteSheet} disabled={!selectedSheet}>
            <u>D</u>elete
          </MenuButton>
          <MenuButton onClick={onExportSheet} disabled={!selectedSheet}>
            E<u>x</u>port
          </MenuButton>
        </ButtonContainer>
        <HSep />

        <TabsContainer>
          <TabButton
            title="Local storage"
            tabIndex={0}
            key="localStorage"
            $selected={
              storageBackend.id === localStorageBackend.id && !addingStorage
            }
            onClick={() => setUseLocalStorage()}
          >
            <IconLocal /> My sheets
          </TabButton>
          {userRemotes.remotes.map((backend) => (
            <TabButton
              tabIndex={0}
              key={backend.url}
              $selected={storageBackend.id === backend.url && !addingStorage}
              $loading={loadingStorages.includes(backend.url)}
              onClick={() => setUseRemoteBackend(backend.url)}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              {loadingStorages.includes(backend.url) ? (
                <IconProgress />
              ) : brokenStorages.includes(backend.url) ? (
                <IconNetworkOff />
              ) : (
                <IconNetwork />
              )}
              {backend.url}/
              <BasicButton
                style={{ display: "flex", alignItems: "center" }}
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!(await popupConfirm(`Close backend: ${backend.url}?`))) {
                    return;
                  }
                  userRemotes.removeRemote(backend);
                  setSheetsMap((s) => ({ ...s, [backend.url]: [] }));
                  setBrokenStorages((s) => s.filter((s) => s !== backend.url));
                  setUseLocalStorage();
                }}
              >
                <IoMdClose style={{ marginLeft: "auto" }} />
              </BasicButton>
            </TabButton>
          ))}
          <TabButton
            tabIndex={0}
            key="add"
            $selected={addingStorage}
            title="Add remote backend"
            onClick={async () => {
              setAddingStorage(true);
              await new Promise((resolve) => setTimeout(resolve, 0));
              let url = await popupPrompt(
                "Input URL for remote backend",
                "Add a remote backend",
              );
              if (url && userRemotes.remotes.find((b) => b.url === url)) {
                await popupAlert("Already connected to remote!");
                setUseRemoteBackend(url);
              } else if (
                url &&
                (url.startsWith("http://") || url.startsWith("https://"))
              ) {
                if (url.endsWith("/")) {
                  url = url.slice(0, -1);
                }

                const res = await handshake(url);
                if (!res.ok) {
                  await popupAlert(
                    "Could not connect to remote backend: " + res.error,
                  );
                } else {
                  userRemotes.addRemote({
                    url,
                  });
                  setUseRemoteBackend(url);
                }
              } else {
                if (url) {
                  await popupAlert("Invalid URL: " + url);
                }
              }
              setAddingStorage(false);
            }}
          >
            <IoMdAdd />
          </TabButton>
        </TabsContainer>
        <FilesContainerOutline>
          <FilesContainer>
            <Columns>
              <div>Name</div>
              <div>Updated</div>
              <div>Created</div>
            </Columns>

            {sheets
              ?.sort((a, b) => {
                const aDate = new Date(a.updated);
                const bDate = new Date(b.updated);
                return bDate.getTime() - aDate.getTime();
              })
              .map((sheet, ind) => (
                <File
                  tabIndex={ind}
                  key={sheet.id}
                  href={sheet.id === selectedSheet ? getUrl() : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sheet.id !== selectedSheet) {
                      setTimeout(() => setSelectedSheet(sheet.id), 0);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (sheet.id !== selectedSheet) {
                        setTimeout(() => setSelectedSheet(sheet.id), 0);
                      }
                    }
                  }}
                  $selected={sheet.id === selectedSheet}
                >
                  <NameCell>
                    <FaFileCsv />
                    {sheet.name}
                  </NameCell>
                  <Time dateTime={sheet.updated} />
                  <Time dateTime={sheet.created} />
                </File>
              ))}

            {!creatingSheet && brokenStorages.includes(storageBackend.id) ? (
              <FileCreating>
                Failed to connect to remote: {storageBackend.id}
              </FileCreating>
            ) : (
              sheets?.length === 0 &&
              !loadingStorages.includes(storageBackend.id) && (
                <FileCreating>
                  No sheets found. Select "New" to create one.
                </FileCreating>
              )
            )}
            {loadingStorages.includes(storageBackend.id) && (
              <FileCreating>
                {(sheetsMap[storageBackend.id] ?? []).length === 0
                  ? "Connecting to remote..."
                  : "Updating remote..."}
              </FileCreating>
            )}
            {creatingSheet && (
              <FileCreating>Creating "{creatingSheet}"...</FileCreating>
            )}
            {importingSheet && (
              <FileCreating>Importing "{importingSheet}"...</FileCreating>
            )}
          </FilesContainer>
        </FilesContainerOutline>
      </FolderContainer>
    </Background>
  );
};

const TimeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TimeText = styled.div`
  font-size: smaller;
`;

const Time = ({ dateTime }: { dateTime: string }) => {
  const timeString = new Date(dateTime).toLocaleString();

  const [date, time] = timeString.split(", ");
  return (
    <TimeContainer>
      <TimeText>{date}</TimeText>
      <TimeText>{time}</TimeText>
    </TimeContainer>
  );
};
