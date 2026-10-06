import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOutletEmployeesForApp, type OutletEmployeeOption } from "../lib/outlet-employees";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

type Props = {
  supabase: SupabaseClient;
  photoUri: string;
  previewReturnNumber: string | null;
  saving: boolean;
  saveError: string | null;
  contentPaddingBottom: number;
  onBack: () => void;
  onSubmit: (
    outletEmployeeId: string,
    passcode: string,
    signaturePad: SignaturePadHandle,
  ) => void;
};

export function ReturnSubmitScreen({
  supabase,
  photoUri,
  previewReturnNumber,
  saving,
  saveError,
  contentPaddingBottom,
  onBack,
  onSubmit,
}: Props) {
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [employees, setEmployees] = useState<OutletEmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [signatureValid, setSignatureValid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEmployeesLoading(true);
    void fetchOutletEmployeesForApp(supabase).then((result) => {
      if (cancelled) return;
      setEmployeesLoading(false);
      if (!result.ok) {
        setEmployeesError(result.error);
        return;
      }
      setEmployees(result.employees);
      if (result.employees.length === 1) {
        setSelectedEmployeeId(result.employees[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const passcodeOk = passcode.trim().length >= 4;
  const canSubmit =
    Boolean(selectedEmployeeId) && passcodeOk && signatureValid && !saving && !employeesLoading;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Submit return</Text>
      {previewReturnNumber ? (
        <Text style={styles.meta}>Return no. (preview): {previewReturnNumber}</Text>
      ) : null}

      <Image source={{ uri: photoUri }} style={styles.photo} accessibilityLabel="Return photo" />

      <Text style={styles.label}>Employee</Text>
      {employeesLoading ? (
        <ActivityIndicator color="#c41e3a" />
      ) : employeesError ? (
        <Text style={styles.err}>{employeesError}</Text>
      ) : employees.length === 0 ? (
        <Text style={styles.err}>No employees configured in the portal.</Text>
      ) : (
        <View style={styles.employeeList}>
          {employees.map((emp) => {
            const selected = emp.id === selectedEmployeeId;
            return (
              <Pressable
                key={emp.id}
                style={[styles.employeeRow, selected && styles.employeeRowSelected]}
                onPress={() => {
                  setSelectedEmployeeId(emp.id);
                  setPasscode("");
                }}
                disabled={saving}
              >
                <Text style={[styles.employeeText, selected && styles.employeeTextSelected]}>
                  {emp.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedEmployeeId ? (
        <>
          <Text style={styles.label}>Passcode</Text>
          <TextInput
            style={styles.input}
            value={passcode}
            onChangeText={setPasscode}
            secureTextEntry
            keyboardType="number-pad"
            editable={!saving}
            placeholder="Enter passcode"
            placeholderTextColor="#a8a29e"
          />
        </>
      ) : null}

      <SignaturePad ref={signatureRef} disabled={saving} onValidityChange={setSignatureValid} />

      {saveError ? <Text style={styles.err}>{saveError}</Text> : null}

      <Pressable
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        disabled={!canSubmit}
        onPress={() => {
          const pad = signatureRef.current;
          if (!pad || !selectedEmployeeId) return;
          onSubmit(selectedEmployeeId, passcode.trim(), pad);
        }}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Submit return</Text>
        )}
      </Pressable>

      <Pressable style={styles.backBtn} onPress={onBack} disabled={saving}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#292524", textAlign: "center" },
  meta: { marginTop: 6, fontSize: 13, color: "#57534e", textAlign: "center" },
  photo: {
    marginTop: 16,
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#f5f5f4",
  },
  label: { marginTop: 18, fontSize: 14, fontWeight: "700", color: "#292524" },
  employeeList: {
    marginTop: 8,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    overflow: "hidden",
  },
  employeeRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e7e5e4",
  },
  employeeRowSelected: { backgroundColor: "#fef2f2" },
  employeeText: { fontSize: 15, color: "#292524" },
  employeeTextSelected: { color: "#c41e3a", fontWeight: "700" },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  err: { marginTop: 10, color: "#b91c1c", fontSize: 13, textAlign: "center" },
  submitBtn: {
    marginTop: 20,
    backgroundColor: "#c41e3a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { marginTop: 16, alignSelf: "center", padding: 10 },
  backBtnText: { color: "#c41e3a", fontWeight: "600" },
});
