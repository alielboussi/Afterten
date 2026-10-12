import { StyleSheet } from "react-native";

export const CHECKLIST_ICON_SIZE = 30;

/** Large touch targets for loading / offloading checklists. */
export const checklistStyles = StyleSheet.create({
  table: { marginTop: 4 },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  tableBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  cellHeader: { fontSize: 12, fontWeight: "700", color: "#78716c" },
  cellBody: { fontSize: 15, color: "#292524", fontWeight: "600" },
  colCheck: { width: 44, alignItems: "center", justifyContent: "center" },
  colProduct: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 10 },
  colQty: { width: 56, flexShrink: 0, textAlign: "center" },
  colUom: { width: 72, flexShrink: 0, textAlign: "center" },
  cellProductNameMain: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e3a8a",
    textDecorationLine: "underline",
  },
  cellProductNameAuto: { fontSize: 15, color: "#44403c", paddingLeft: 4 },
});
