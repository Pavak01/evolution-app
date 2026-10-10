import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import {
  getFinalCalculation,
  getYearEnd,
  startFinalCalculation,
  submitTaxReturn,
  type FinalCalculation,
  type YearEndEligibility,
  type YearEndStatus
} from "../../api/hmrc";
import { Card, PrimaryButton, SmallAction, StatusBanner, SummaryRow } from "../../components/Controls";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatUkDate } from "../../utils/taxYear";

// The annual tax return through Making Tax Digital, for customers whose only
// income is this self-employment: eligibility questions → HMRC's final
// calculation → declaration → submit. Anyone else is pointed elsewhere.

const QUESTIONS: { key: keyof YearEndEligibility; text: string; help: string }[] = [
  {
    key: "only_self_employment_income",
    text: "My only income this tax year was this self-employment",
    help: "No job (PAYE), pension, rent, savings interest, dividends or other income."
  },
  { key: "no_student_loan", text: "I don't have a student or postgraduate loan to repay", help: "Loan repayments are worked out on the tax return." },
  {
    key: "no_pension_or_gift_aid_claims",
    text: "I'm not claiming tax relief on pension payments or Gift Aid",
    help: "Those go on the tax return as reliefs."
  },
  {
    key: "no_child_benefit_charge",
    text: "I don't owe the High Income Child Benefit Charge",
    help: "Only applies if you or your partner get Child Benefit and one of you earns over £60,000."
  },
  { key: "uk_resident", text: "I was a UK resident for the whole tax year", help: "" }
];

// The tax year a return can be filed for: last year once it has ended.
// The sandbox (test mode) can rehearse the current year.
function returnTaxYear(sandbox: boolean): string {
  const today = new Date();
  const startYear = today.getMonth() > 3 || (today.getMonth() === 3 && today.getDate() >= 6) ? today.getFullYear() : today.getFullYear() - 1;
  const y = sandbox ? startYear : startYear - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function YearEndReturn({ sandbox }: { sandbox: boolean }): React.JSX.Element {
  const taxYear = returnTaxYear(sandbox);
  const [status, setStatus] = useState<YearEndStatus | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<keyof YearEndEligibility, boolean>>>({});
  const [calculation, setCalculation] = useState<FinalCalculation | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<"calc" | "submit" | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await getYearEnd(taxYear));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't load your tax return." });
    }
  }, [taxYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const answered = QUESTIONS.every((q) => answers[q.key] !== undefined);
  const eligible = QUESTIONS.every((q) => answers[q.key] === true);

  // HMRC works the final calculation out in the background; ask until ready.
  async function fetchCalculation(): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await getFinalCalculation(taxYear);
      if (result.status !== "pending") {
        setCalculation(result);
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    }
    setMessage({ kind: "error", text: "HMRC is taking a while to work out your calculation. Try again in a few minutes." });
  }

  async function handleCalculate(): Promise<void> {
    setMessage(null);
    setAgreed(false);
    setBusy("calc");
    try {
      await startFinalCalculation(taxYear, answers as YearEndEligibility);
      await fetchCalculation();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't get your final calculation." });
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!status || !calculation || calculation.status !== "ready" || !calculation.calculation_id) return;
    setBusy("submit");
    try {
      const result = await submitTaxReturn(taxYear, calculation.calculation_id, status.declaration.version);
      setMessage({
        kind: "info",
        text: `Your ${taxYear} tax return has been submitted to HMRC${result.correlation_id ? ` (reference ${result.correlation_id.slice(0, 8)})` : ""}.`
      });
      setCalculation(null);
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "HMRC didn't accept the tax return. Nothing was submitted." });
    } finally {
      setBusy(null);
    }
  }

  if (!status) return <Card>{message ? <StatusBanner kind={message.kind} text={message.text} /> : <ActivityIndicator color={colors.accent} />}</Card>;

  const submitted = status.record?.submitted_at;
  const ready = calculation?.status === "ready" ? calculation : null;

  return (
    <Card>
      <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
        {taxYear} tax return
      </Text>
      {message && <StatusBanner kind={message.kind} text={message.text} />}

      {submitted ? (
        <Text style={{ color: colors.textSecondary }}>
          Submitted to HMRC on {formatUkDate(submitted.slice(0, 10))}
          {status.record?.correlation_id ? ` · reference ${status.record.correlation_id.slice(0, 8)}` : ""}. Nothing more to do for {taxYear}.
        </Text>
      ) : !status.year_ended ? (
        <Text style={{ color: colors.textSecondary }}>You can file this after the tax year ends on 5 April. The deadline is 31 January.</Text>
      ) : !ready ? (
        <>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            Once all four quarterly updates are sent, Evolution can file your tax return. First, a few questions:
          </Text>
          {QUESTIONS.map((q) => (
            <View key={q.key} style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
              <Text style={{ color: colors.textMain, fontWeight: "600" }}>{q.text}</Text>
              {q.help ? <Text style={{ color: colors.textMuted, fontSize: typography.small }}>{q.help}</Text> : null}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <SmallAction label="Yes" active={answers[q.key] === true} onPress={() => setAnswers((a) => ({ ...a, [q.key]: true }))} />
                <SmallAction label="No" active={answers[q.key] === false} onPress={() => setAnswers((a) => ({ ...a, [q.key]: false }))} />
              </View>
            </View>
          ))}
          {answered && !eligible && (
            <StatusBanner
              kind="error"
              text="Evolution can't file a complete tax return for you this year. Use an accountant or other HMRC-recognised software. Your quarterly updates from Evolution still count."
            />
          )}
          {eligible && <PrimaryButton label="Get HMRC's final calculation" onPress={handleCalculate} isLoading={busy === "calc"} />}
        </>
      ) : (
        <>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>HMRC's final calculation for {taxYear}, from everything you've sent:</Text>
          {ready.profit !== null && <SummaryRow label="Profit" value={ready.profit} />}
          {ready.income_tax !== null && <SummaryRow label="Income tax" value={ready.income_tax} />}
          {ready.class2_nic !== null && <SummaryRow label="NI class 2" value={ready.class2_nic} />}
          {ready.class4_nic !== null && <SummaryRow label="NI class 4" value={ready.class4_nic} />}
          {ready.total_due !== null && <SummaryRow label="Total tax and NI due" value={ready.total_due} />}
          {ready.messages.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              {ready.messages.map((m) => (
                <Text key={m} style={{ color: ready.errors.includes(m) ? colors.danger : colors.textMuted, fontSize: typography.small }}>
                  • {m}
                </Text>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => setAgreed((v) => !v)}
            style={{ flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md, alignItems: "flex-start" }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Text style={{ fontSize: 22, color: agreed ? colors.accent : colors.textMuted }}>{agreed ? "☑" : "☐"}</Text>
            <Text style={{ flex: 1, color: colors.textMain }}>{status.declaration.text}</Text>
          </Pressable>
          <PrimaryButton label="Submit tax return to HMRC" onPress={handleSubmit} isLoading={busy === "submit"} disabled={!agreed} />
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: spacing.md, fontWeight: "600" }} onPress={() => setCalculation(null)}>
            Cancel
          </Text>
        </>
      )}
    </Card>
  );
}
