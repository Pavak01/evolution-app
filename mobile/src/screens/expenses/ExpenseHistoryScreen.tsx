import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { listExpenses } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { PendingUploads } from "../../components/PendingUploads";
import { CategoryPickerModal } from "../../components/CategoryPickerModal";
import { Card, DateField, Field, StatusBanner } from "../../components/Controls";
import { listPending, removePending, syncQueue, type PendingItem } from "../../offlineQueue";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { humanizeCategory } from "../../utils/category";
import { formatUkDate, getTaxYearFromDate } from "../../utils/taxYear";
import type { ExpensesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ExpensesStackParamList, "ExpenseHistory">;

const SEARCH_DEBOUNCE_MS = 400;

type Filters = { category: string | null; from: string; to: string; minAmount: string; maxAmount: string };

const EMPTY_FILTERS: Filters = { category: null, from: "", to: "", minAmount: "", maxAmount: "" };

export function ExpenseHistoryScreen({ navigation }: Props): React.JSX.Element {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // The request that's currently in flight — a slow earlier reset (e.g. a
  // broad search) that resolves after a newer one would otherwise clobber
  // fresher results with stale ones.
  const requestIdRef = useRef(0);
  // Once true, a reset load (search, filters, pull-to-refresh, refocus)
  // never again triggers the full-screen spinner below — only isLoading's
  // RefreshControl reflects it. Without this, every debounced search
  // keystroke unmounted the whole tree (including the focused search box
  // itself) via the early return, closing the keyboard after the first letter.
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      const requestId = ++requestIdRef.current;
      setError(null);
      // Independent try/catch per source: listPending() is purely local and
      // must still populate while offline, when the network call below is
      // exactly the thing failing — bundling them in one Promise.all meant
      // a network failure silently hid the pending items too.
      try {
        const allPending = await listPending();
        if (requestId === requestIdRef.current) {
          setPending(allPending.filter((item) => item.kind === "expense"));
        }
      } catch {
        // pending list is local-only; a failure here isn't user-facing
      }

      if (reset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const taxYear = getTaxYearFromDate(new Date());
        const result = await listExpenses({
          tax_year: taxYear,
          search: searchText.trim() || undefined,
          category: filters.category ?? undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          min_amount: filters.minAmount ? Number(filters.minAmount) : undefined,
          max_amount: filters.maxAmount ? Number(filters.maxAmount) : undefined,
          cursor: reset ? undefined : (cursor ?? undefined)
        });
        if (requestId !== requestIdRef.current) return; // a newer request already landed
        setExpenses((prev) => (reset ? result.expenses : [...prev, ...result.expenses]));
        setCursor(result.next_cursor);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof ApiError ? err.message : "Could not load expenses.");
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
          hasLoadedOnceRef.current = true;
        }
      }
    },
    // cursor deliberately excluded — load(false) reads the latest via closure
    // at call time, but including it here would re-trigger this callback
    // (and anything depending on it) on every page fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchText, filters]
  );

  const handleRetry = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncQueue(() => load(true));
      await load(true);
    } finally {
      setIsSyncing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Search and filter changes reset to page one after a short debounce —
  // skips its own first run so it doesn't double up with the focus-triggered
  // load above on initial mount.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => void load(true), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, filters.category, filters.from, filters.to, filters.minAmount, filters.maxAmount]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const hasActiveFilters = filters.category !== null || filters.from || filters.to || filters.minAmount || filters.maxAmount;

  if (isLoading && !hasLoadedOnceRef.current) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {error && (
        <View style={styles.errorWrap}>
          <StatusBanner kind="error" text={error} />
        </View>
      )}
      <PendingUploads
        items={pending}
        isSyncing={isSyncing}
        onRetry={handleRetry}
        onDelete={(localId) => {
          void removePending(localId).then(() => load(true));
        }}
      />
      <View style={styles.searchWrap}>
        <Field label="Search" value={searchText} onChange={setSearchText} placeholder="Category or notes..." />
        <Text style={styles.filtersToggle} onPress={() => setShowFilters((current) => !current)}>
          {showFilters ? "Hide filters" : "Filters"}
          {hasActiveFilters ? " •" : ""}
        </Text>
      </View>

      {showFilters && (
        <Card>
          <CategoryPickerModal
            label="Category"
            value={filters.category ?? ""}
            onChange={(value) => updateFilter("category", value || null)}
            allowClear
          />
          <DateField label="From" value={filters.from} onChange={(value) => updateFilter("from", value)} />
          <DateField label="To" value={filters.to} onChange={(value) => updateFilter("to", value)} />
          <Field label="Min amount (£)" value={filters.minAmount} onChange={(value) => updateFilter("minAmount", value)} keyboardType="decimal-pad" placeholder="0.00" />
          <Field label="Max amount (£)" value={filters.maxAmount} onChange={(value) => updateFilter("maxAmount", value)} keyboardType="decimal-pad" placeholder="0.00" />
          {hasActiveFilters && <Text style={styles.clearFilters} onPress={() => setFilters(EMPTY_FILTERS)}>Clear filters</Text>}
        </Card>
      )}

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => load(true)} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (cursor && !isLoadingMore && !isLoading) void load(false);
        }}
        ListEmptyComponent={<Text style={styles.empty}>No expenses match — try adjusting search or filters.</Text>}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.accent} style={styles.footerSpinner} /> : null}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.voided_at ? styles.rowVoided : null]}
            onPress={() => navigation.navigate("ExpenseDetail", { expenseId: item.id })}
          >
            <View style={styles.rowMain}>
              <Text style={styles.category}>{humanizeCategory(item.category)}</Text>
              <Text style={styles.date}>{formatUkDate(item.occurred_at)}</Text>
            </View>
            <View style={styles.rowEnd}>
              <Text style={styles.amount}>£{item.total_amount.toFixed(2)}</Text>
              {item.voided_at && <Text style={styles.voided}>voided</Text>}
              {!item.voided_at && !item.receipt_download_url && <Text style={styles.voided}>missing receipt</Text>}
              {!item.voided_at && item.possible_duplicate && <Text style={styles.voided}>possible duplicate</Text>}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  errorWrap: { padding: spacing.md },
  searchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  filtersToggle: { color: colors.accent, fontWeight: "600", marginBottom: spacing.sm },
  clearFilters: { color: colors.danger, fontWeight: "600", textAlign: "center", marginTop: spacing.sm },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: spacing.xxl },
  footerSpinner: { marginVertical: spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md
  },
  // A small "voided" badge alone was easy to miss — dim the whole row too,
  // so a voided entry reads as struck-through at a glance, not just on close inspection.
  rowVoided: { opacity: 0.5 },
  rowMain: { gap: spacing.xs },
  category: { fontSize: typography.body, fontWeight: "700", color: colors.textMain, textTransform: "capitalize" },
  date: { fontSize: typography.small, color: colors.textMuted },
  rowEnd: { alignItems: "flex-end", gap: spacing.xs },
  amount: { fontSize: typography.body, fontWeight: "700", color: colors.snapshotValue },
  voided: { fontSize: typography.micro, color: colors.danger, textTransform: "uppercase" }
});
