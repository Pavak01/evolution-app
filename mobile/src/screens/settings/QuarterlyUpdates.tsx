import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import {
  getHmrcCalculation,
  getObligations,
  getQuarterlyPreview,
  listSubmissions,
  sendQuarterlyUpdate,
  type HmrcCalculation,
  type HmrcObligation,
  type HmrcSubmission,
  type QuarterlyTotals
} from "../../api/hmrc";
import { Card, PrimaryButton, SmallAction, StatusBanner, SummaryRow } from "../../components/Controls";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatGbp } from "../../utils/money";
import { formatUkDate, getTodayIso } from "../../utils/taxYear";

// Making Tax Digital quarterly updates: the quarters HMRC expects, a
// preview of exactly what Evolution will send (worked out on the server
// from the user's records), then send. Each update is cumulative from
// 6 April, so a later quarter repeats and replaces the earlier figures.

// HMRC refuses an update more than 10 days before its period ends.
function canSendYet(obligation: HmrcObligation, today: string): boolean {
  const end = new Date(`${obligation.periodEndDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 10);
  return today >= end.toISOString().slice(0, 10);
}

export function QuarterlyUpdates(): React.JSX.Element {
  const [obligations, setObligations] = useState<HmrcObligation[] | null>(null);
  const [submissions, setSubmissions] = useState<HmrcSubmission[]>([]);
  const [preview, setPreview] = useState<QuarterlyTotals | null>(null);
  const [calculation, setCalculation] = useState<HmrcCalculation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [obl, subs] = await Promise.all([getObligations(), listSubmissions()]);
      setObligations([...obl].sort((a, b) => a.periodEndDate.localeCompare(b.periodEndDate)));
      setSubmissions(subs);
      // HMRC's own figures; separate so a slow or failed calculation never
      // hides the quarters.
      getHmrcCalculation()
        .then(setCalculation)
        .catch(() => setCalculation(null));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't load your quarters from HMRC." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPreview(o: HmrcObligation): Promise<void> {
    setMessage(null);
    setBusy(`preview-${o.periodEndDate}`);
    try {
      setPreview(await getQuarterlyPreview(o.periodStartDate, o.periodEndDate));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't work out the totals." });
    } finally {
      setBusy(null);
    }
  }

  async function send(): Promise<void> {
    if (!preview) return;
    setBusy("send");
    try {
      const result = await sendQuarterlyUpdate(preview.period_start, preview.period_end);
      setMessage({
        kind: "info",
        text: `Sent to HMRC. Your update to ${formatUkDate(preview.period_end)} was accepted${result.correlation_id ? ` (reference ${result.correlation_id.slice(0, 8)})` : ""}.`
      });
      setPreview(null);
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "HMRC didn't accept the update. Nothing was sent." });
    } finally {
      setBusy(null);
    }
  }

  if (!obligations) {
    return <Card>{message ? <StatusBanner kind={message.kind} text={message.text} /> : <ActivityIndicator color={colors.accent} />}</Card>;
  }

  const today = getTodayIso();
  // The most recent quarter already sent can be sent again with corrected
  // figures (HMRC's endpoint is "create or amend"; updates are cumulative,
  // so this replaces the year-to-date totals). Earlier quarters can't:
  // HMRC won't let an update's end date move backwards.
  // "Sent" also counts our own record of updates: HMRC's sandbox doesn't
  // reflect them, and live HMRC can lag. Nothing ending before the latest
  // update already sent can be sent (or corrected) again.
  const latestSentEnd = [
    ...obligations.filter((o) => o.status === "fulfilled").map((o) => o.periodEndDate),
    ...submissions.filter((s) => s.period_start === obligations[0]?.periodStartDate).map((s) => s.period_end)
  ].reduce((max, d) => (d > max ? d : max), "");
  const lastSent = obligations.find((o) => o.periodEndDate === latestSentEnd);

  return (
    <>
      {message && <StatusBanner kind={message.kind} text={message.text} />}

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Quarterly updates</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
          Each update covers the tax year so far, from 6 April. Evolution works out the figures from your records.
        </Text>
        {obligations.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>HMRC has no quarterly updates due for you this tax year.</Text>
        ) : (
          obligations.map((o, i) => {
            const sent = o.status === "fulfilled" || o.periodEndDate <= latestSentEnd;
            const ready = !sent && canSendYet(o, today);
            const overdue = !sent && today > o.dueDate;
            return (
              <View key={o.periodEndDate} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.cardBorder }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.textMain, fontWeight: "600" }}>
                    Quarter {i + 1}: to {formatUkDate(o.periodEndDate)}
                  </Text>
                  <Text style={{ color: overdue ? colors.danger : colors.textMuted, fontSize: typography.small }}>
                    {sent
                      ? `Sent${o.receivedDate ? ` ${formatUkDate(o.receivedDate)}` : ""}`
                      : `${overdue ? "Overdue: was due" : "Due"} ${formatUkDate(o.dueDate)}`}
                  </Text>
                </View>
                {ready && <SmallAction label="Review" active onPress={() => void openPreview(o)} />}
                {sent && o === lastSent && <SmallAction label="Correct" onPress={() => void openPreview(o)} />}
                {busy === `preview-${o.periodEndDate}` && <ActivityIndicator color={colors.accent} />}
              </View>
            );
          })
        )}
      </Card>

      {preview && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
            Update to {formatUkDate(preview.period_end)}
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            {formatUkDate(preview.period_start)} to {formatUkDate(preview.period_end)}: {preview.income_count} income record
            {preview.income_count === 1 ? "" : "s"}, {preview.expense_count} expense{preview.expense_count === 1 ? "" : "s"}.
          </Text>
          <SummaryRow label="Income (turnover)" value={preview.turnover} />
          <SummaryRow label="Car, van and travel" value={preview.expenses.carVanTravelExpenses} />
          <SummaryRow label="Phone and office costs" value={preview.expenses.adminCosts} />
          <SummaryRow label="Accountancy and professional fees" value={preview.expenses.professionalFees} />
          <SummaryRow label="Other business expenses" value={preview.expenses.otherExpenses} />
          <SummaryRow label="Total expenses" value={preview.total_expenses} />
          {preview.awaiting_receipt_count > 0 && (
            <Text style={{ color: colors.danger, marginTop: spacing.sm }}>
              {preview.awaiting_receipt_count} travel expense{preview.awaiting_receipt_count === 1 ? "" : "s"} (
              {formatGbp(preview.awaiting_receipt_amount)}) still waiting for a receipt {preview.awaiting_receipt_count === 1 ? "isn't" : "aren't"} included.
              Attach the receipt and they'll go in your next update.
            </Text>
          )}
          <Text style={{ color: colors.textMuted, fontSize: typography.small, marginVertical: spacing.sm }}>
            Check these match your records. Sending replaces any earlier figures for this tax year at HMRC.
          </Text>
          <PrimaryButton label="Send to HMRC" onPress={send} isLoading={busy === "send"} />
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: spacing.md, fontWeight: "600" }} onPress={() => setPreview(null)}>
            Cancel
          </Text>
        </Card>
      )}

      {calculation?.status === "ready" && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
            HMRC's calculation
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            This calculation is only based on information HMRC have received about your income and expenses
            {calculation.period_to ? ` to ${formatUkDate(calculation.period_to)}` : ""}. This may change as HMRC receive further information about
            you during the tax year. Compare it with your Summary; if they differ a lot, check your records.
          </Text>
          {calculation.profit !== null && <SummaryRow label="Profit so far" value={calculation.profit} />}
          {calculation.income_tax !== null && <SummaryRow label="Income tax" value={calculation.income_tax} />}
          {calculation.class2_nic !== null && <SummaryRow label="NI class 2" value={calculation.class2_nic} />}
          {calculation.class4_nic !== null && <SummaryRow label="NI class 4" value={calculation.class4_nic} />}
          {calculation.end_of_year && (
            <>
              <Text style={{ fontWeight: "700", color: colors.textMain, marginTop: spacing.sm }}>HMRC's estimate for the full year</Text>
              {calculation.end_of_year.estimated_income !== null && <SummaryRow label="Estimated income" value={calculation.end_of_year.estimated_income} />}
              <SummaryRow label="Income tax and NI" value={calculation.end_of_year.total} />
            </>
          )}
          {calculation.messages.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              {calculation.messages.map((m) => (
                <Text key={m} style={{ color: colors.textMuted, fontSize: typography.small }}>
                  • {m}
                </Text>
              ))}
            </View>
          )}
        </Card>
      )}
      {calculation?.status === "pending" && (
        <Card>
          <Text style={{ color: colors.textMuted }}>HMRC is still working out its calculation from your latest update. Check back in a minute.</Text>
        </Card>
      )}

      {submissions.length > 0 && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Sent updates</Text>
          {submissions.map((s) => (
            <View key={s.id} style={{ paddingVertical: spacing.xs }}>
              <Text style={{ color: colors.textMain }}>
                {s.tax_year}, to {formatUkDate(s.period_end)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.small }}>
                Sent {formatUkDate(s.submitted_at.slice(0, 10))}
                {s.correlation_id ? ` · ref ${s.correlation_id.slice(0, 8)}` : ""}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
